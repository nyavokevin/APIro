//! Git integration by shelling out to the system `git` binary (no libgit2
//! dependency). Every function is bounded to a workspace directory and
//! returns human-readable output for the diff panel.

use std::path::Path;
use std::process::Command;

fn git(dir: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("failed to spawn git: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.trim().to_string())
    }
}

/// True when `dir` is inside a Git work tree.
pub fn is_repo(dir: &Path) -> bool {
    git(dir, &["rev-parse", "--is-inside-work-tree"])
        .map(|out| out.trim() == "true")
        .unwrap_or(false)
}

/// Current branch name, or "HEAD" when detached.
pub fn branch(dir: &Path) -> Result<String, String> {
    let out = git(dir, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(out.trim().to_string())
}

/// `git status --porcelain` lines: `XY path`.
pub fn status(dir: &Path) -> Result<Vec<String>, String> {
    let out = git(dir, &["status", "--porcelain"])?;
    Ok(out.lines().map(|l| l.to_string()).collect())
}

/// Unified diff for a single file (working tree vs index).
pub fn diff_file(dir: &Path, path: &str) -> Result<String, String> {
    git(dir, &["diff", "--", path])
}

/// Unified diff of the whole working tree.
pub fn diff_all(dir: &Path) -> Result<String, String> {
    git(dir, &["diff"])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_repo_dir_reports_not_a_repo() {
        assert!(!is_repo(Path::new("Z:/definitely/not/a/repo")));
    }
}