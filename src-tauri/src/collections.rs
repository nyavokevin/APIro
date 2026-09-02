//! Git-native collection storage: a collection is a folder on disk, a request
//! is a human-readable `<name>.request.yaml` file. Node ids are the relative
//! paths, so merges and diffs stay line-based and meaningful.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RequestYaml {
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<YamlPair>,
    #[serde(default)]
    pub params: Vec<YamlPair>,
    #[serde(default)]
    pub body_type: String,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YamlPair {
    pub key: String,
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Node {
    #[serde(rename = "folder")]
    Folder { name: String, children: Vec<Node> },
    #[serde(rename = "request")]
    Request { name: String, request: RequestYaml },
}

const REQUEST_EXT: &str = ".request.yaml";

/// Write a node tree to disk. Returns the list of files written.
pub fn write_tree(node: &Node, dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut written = Vec::new();
    write_node(node, dir, &mut written)?;
    Ok(written)
}

/// Replace entire workspace tree with a new set of top-level nodes.
/// Clears stale `*.request.yaml` files and empty folders before writing.
pub fn replace_all(nodes: &[Node], dir: &Path) -> Result<Vec<PathBuf>, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    // Remove stale request files and empty dirs (preserve .git etc)
    clean_workspace(dir)?;
    let mut written = Vec::new();
    for node in nodes {
        write_node(node, dir, &mut written)?;
    }
    Ok(written)
}

fn clean_workspace(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    let entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    for path in entries {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            clean_workspace(&path)?;
            // Remove empty dirs after cleaning children
            let is_empty = std::fs::read_dir(&path)
                .map(|mut it| it.next().is_none())
                .unwrap_or(false);
            if is_empty {
                let _ = std::fs::remove_dir(&path);
            }
        } else if name.ends_with(REQUEST_EXT) {
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}

fn write_node(node: &Node, dir: &Path, written: &mut Vec<PathBuf>) -> Result<(), String> {
    match node {
        Node::Folder { name, children } => {
            let folder = dir.join(sanitize(name));
            fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
            for child in children {
                write_node(child, &folder, written)?;
            }
            Ok(())
        }
        Node::Request { name, request } => {
            let file = dir.join(format!("{}{REQUEST_EXT}", sanitize(name)));
            let yaml = serde_yaml::to_string(request).map_err(|e| e.to_string())?;
            fs::write(&file, yaml).map_err(|e| e.to_string())?;
            written.push(file);
            Ok(())
        }
    }
}

/// Read a directory tree into nodes; nested folders recurse, `*.request.yaml`
/// files become request nodes (sorted for deterministic output).
pub fn read_tree(dir: &Path) -> Result<Vec<Node>, String> {
    let mut nodes = Vec::new();
    if !dir.exists() {
        return Ok(nodes);
    }
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    entries.sort();
    for path in entries {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        if path.is_dir() {
            if name.starts_with('.') {
                continue; // skip .git and friends
            }
            let children = read_tree(&path)?;
            nodes.push(Node::Folder { name, children });
        } else if name.ends_with(REQUEST_EXT) {
            let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let mut request: RequestYaml = serde_yaml::from_str(&raw).map_err(|e| e.to_string())?;
            request.name = name.trim_end_matches(REQUEST_EXT).to_string();
            nodes.push(Node::Request { name: request.name.clone(), request });
        }
    }
    Ok(nodes)
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn yaml_round_trip_is_human_readable() {
        let req = RequestYaml {
            name: "Get Users".into(),
            method: "GET".into(),
            url: "{{base_url}}/users?page=1".into(),
            headers: vec![YamlPair { key: "Accept".into(), value: "application/json".into(), enabled: true }],
            params: vec![],
            body_type: "none".into(),
            body: String::new(),
        };
        let yaml = serde_yaml::to_string(&req).unwrap();
        assert!(yaml.contains("method: GET"));
        assert!(yaml.contains("url: '{{base_url}}/users?page=1'"));
        let back: RequestYaml = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(back, req);
    }

    #[test]
    fn tree_write_then_read_round_trips() {
        let login = Node::Request {
            name: "Login".into(),
            request: RequestYaml {
                name: "Login".into(),
                method: "POST".into(),
                url: "https://x.io/login".into(),
                headers: vec![],
                params: vec![],
                body_type: "json".into(),
                body: "{\"u\":\"a\"}".into(),
            },
        };
        let admin = Node::Folder { name: "Admin".to_string(), children: vec![] };
        let tree = Node::Folder {
            name: "My API".into(),
            children: vec![login.clone(), admin.clone()],
        };
        let tmp = std::env::temp_dir().join(format!("apiforge-test-{}", uuid::Uuid::new_v4()));
        write_tree(&tree, &tmp).unwrap();
        let read_back = read_tree(&tmp).unwrap();
        // read_tree sorts entries alphabetically, so "Admin" precedes "Login".
        let expected = Node::Folder {
            name: "My API".to_string(),
            children: vec![admin, login],
        };
        assert_eq!(read_back, vec![expected]);
        fs::remove_dir_all(&tmp).unwrap();
    }
}