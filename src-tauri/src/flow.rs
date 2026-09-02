//! Connection Flow — Rust-side analyzer mirroring the TS flow/analyzer.ts
//! Exposes two Tauri commands: `flow_analyze` and `flow_export_svg`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

use crate::collections::{self, Node};
use crate::commands::default_workspace;

// ── types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowNode {
    pub id: String,
    pub label: String,
    pub node_type: String, // request | environmentVar | collection | script
    pub method: Option<String>,
    pub url: String,
    pub collection_id: String,
    pub request_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub edge_type: String, // dataFlow | authFlow | sequence | dependency | errorFlow
    pub label: Option<String>,
    pub animated: bool,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowGraph {
    pub nodes: Vec<FlowNode>,
    pub edges: Vec<FlowEdge>,
    pub layout: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowAnalyzeArgs {
    pub dir: Option<String>,
    pub collection_id: Option<String>,
    pub layout: Option<String>,
    pub include_sequence: Option<bool>,
    pub include_auth: Option<bool>,
    pub include_data_flow: Option<bool>,
}

// ── helpers ─────────────────────────────────────────────────────────────────

fn method_color(method: &str) -> &'static str {
    match method.to_ascii_uppercase().as_str() {
        "GET" => "#3fd68f",
        "POST" => "#ffb224",
        "PUT" => "#4d9fff",
        "PATCH" => "#bb9af7",
        "DELETE" => "#ff4d4f",
        _ => "#767676",
    }
}

fn edge_color(kind: &str) -> &'static str {
    match kind {
        "dataFlow" => "#4d9fff",
        "authFlow" => "#ffb224",
        "sequence" => "#3d3d3d",
        "errorFlow" => "#ff4d4f",
        _ => "#767676",
    }
}

fn slug(s: &str) -> String {
    let mut out = String::new();
    let mut last_underscore = false;
    for c in s.chars() {
        if c.is_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            last_underscore = false;
        } else if !last_underscore {
            out.push('_');
            last_underscore = true;
        }
    }
    let trimmed = out.trim_matches('_').to_string();
    if trimmed.is_empty() { "node".into() } else { trimmed.chars().take(48).collect() }
}

fn extract_mustaches(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i + 1 < chars.len() {
        if chars[i] == '{' && chars[i + 1] == '{' {
            let mut j = i + 2;
            while j + 1 < chars.len() && !(chars[j] == '}' && chars[j + 1] == '}') {
                j += 1;
            }
            if j + 1 < chars.len() {
                let inner: String = chars[i + 2..j].iter().collect();
                let var = inner.trim().to_string();
                if !var.is_empty() {
                    // take first token before dot/bracket for simplicity
                    let key = var.split(|c| c == '.' || c == '[').next().unwrap_or(&var).trim().to_string();
                    if !key.is_empty() && !out.contains(&key) {
                        out.push(key);
                    }
                }
                i = j + 2;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn extract_set_vars(script: &str) -> Vec<String> {
    // looks for pm.environment.set("VAR"  or pm.variables.set('VAR'
    let mut out = Vec::new();
    for pat in ["pm.environment.set(", "pm.variables.set(", "pm.collectionVariables.set("] {
        let mut start = 0;
        while let Some(idx) = script[start..].find(pat) {
            let abs = start + idx + pat.len();
            let rest = &script[abs..];
            let rest_trim = rest.trim_start();
            if let Some(q) = rest_trim.chars().next() {
                if q == '"' || q == '\'' {
                    let quote = q;
                    if let Some(end) = rest_trim[1..].find(quote) {
                        let var = rest_trim[1..1 + end].to_string();
                        if !var.is_empty() && !out.contains(&var) {
                            out.push(var);
                        }
                    }
                }
            }
            start = abs + 1;
            if start >= script.len() { break; }
        }
    }
    out
}

#[derive(Debug, Clone)]
struct FlatReq {
    node_name: String,
    id: String, // synthetic id if needed
    name: String,
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    params: Vec<(String, String)>,
    body: String,
    pre_script: String,
    test_script: String,
    // path for grouping
    top_name: String,
}

fn flatten_nodes(nodes: &[Node], top_name: &str, out: &mut Vec<FlatReq>) {
    for n in nodes {
        match n {
            Node::Folder { name, children } => {
                let top = if top_name.is_empty() { name.clone() } else { top_name.to_string() };
                flatten_nodes(children, &top, out);
            }
            Node::Request { name, request } => {
                let top = if top_name.is_empty() { name.clone() } else { top_name.to_string() };
                out.push(FlatReq {
                    node_name: name.clone(),
                    id: format!("{}-{}", slug(name), slug(&request.url)),
                    name: request.name.clone(),
                    method: request.method.clone(),
                    url: request.url.clone(),
                    headers: request.headers.iter().map(|p| (p.key.clone(), p.value.clone())).collect(),
                    params: request.params.iter().map(|p| (p.key.clone(), p.value.clone())).collect(),
                    body: request.body.clone(),
                    pre_script: String::new(),
                    test_script: String::new(),
                    top_name: top,
                });
            }
        }
    }
}

fn content_of(r: &FlatReq) -> String {
    let mut parts = vec![r.url.clone(), r.body.clone()];
    for (k, v) in &r.headers { parts.push(k.clone()); parts.push(v.clone()); }
    for (k, v) in &r.params { parts.push(k.clone()); parts.push(v.clone()); }
    parts.join("\n")
}

// Simple layout: hierarchical ; others fallback to hierarchical for now
fn apply_layout(graph: &mut FlowGraph, layout: &str) {
    match layout {
        "grid" => layout_grid(graph),
        "circular" => layout_circular(graph),
        "forceDirected" | "force_directed" => layout_force(graph),
        _ => layout_hierarchical(graph),
    }
}

fn layout_hierarchical(graph: &mut FlowGraph) {
    if graph.nodes.is_empty() { return; }
    // compute levels via Kahn
    let mut in_deg: HashMap<String, usize> = HashMap::new();
    let mut levels: HashMap<String, usize> = HashMap::new();
    for n in &graph.nodes { in_deg.insert(n.id.clone(), 0); levels.insert(n.id.clone(), 0); }
    for e in &graph.edges { *in_deg.entry(e.target.clone()).or_insert(0) += 1; }
    let mut queue: Vec<String> = in_deg.iter().filter(|(_, &d)| d==0).map(|(k,_)| k.clone()).collect();
    if queue.is_empty() && !graph.nodes.is_empty() { queue.push(graph.nodes[0].id.clone()); }
    let mut visited = std::collections::HashSet::new();
    while let Some(cur) = queue.pop() {
        if visited.contains(&cur) { continue; }
        visited.insert(cur.clone());
        let cur_lv = *levels.get(&cur).unwrap_or(&0);
        for e in &graph.edges { if e.source == cur {
            let entry = levels.entry(e.target.clone()).or_insert(0);
            *entry = (*entry).max(cur_lv + 1);
            if let Some(d) = in_deg.get_mut(&e.target) {
                *d = d.saturating_sub(1);
                if *d == 0 { queue.push(e.target.clone()); }
            }
        }}
    }
    if visited.len() < graph.nodes.len() {
        let max_lv = *levels.values().max().unwrap_or(&0);
        for n in &graph.nodes { if !visited.contains(&n.id) { levels.insert(n.id.clone(), max_lv+1); } }
    }
    let mut by_level: HashMap<usize, Vec<String>> = HashMap::new();
    for (id, lv) in &levels { by_level.entry(*lv).or_default().push(id.clone()); }
    let mut levels_sorted: Vec<usize> = by_level.keys().cloned().collect();
    levels_sorted.sort();
    for lv in &levels_sorted { by_level.get_mut(lv).unwrap().sort(); }
    let node_w = 200.0;
    let node_h = 72.0;
    let gap_x = 56.0;
    let gap_y = 96.0;
    for lv in levels_sorted {
        let ids = by_level.get(&lv).unwrap();
        let row_w = ids.len() as f64 * (node_w + gap_x) - gap_x;
        let start_x = -row_w / 2.0;
        for (idx, id) in ids.iter().enumerate() {
            if let Some(node) = graph.nodes.iter_mut().find(|n| &n.id == id) {
                node.x = start_x + idx as f64 * (node_w + gap_x);
                node.y = lv as f64 * (node_h + gap_y);
                node.width = node_w;
                node.height = node_h;
            }
        }
    }
}

fn layout_grid(graph: &mut FlowGraph) {
    let n = graph.nodes.len();
    if n==0 { return; }
    let cols = (n as f64).sqrt().ceil() as usize;
    let gap_x = 56.0; let gap_y = 96.0;
    let w = 200.0; let h = 72.0;
    for (i, node) in graph.nodes.iter_mut().enumerate() {
        let col = i % cols;
        let row = i / cols;
        node.x = col as f64 * (w+gap_x) - ((cols-1) as f64 * (w+gap_x))/2.0;
        node.y = row as f64 * (h+gap_y);
        node.width = w; node.height = h;
    }
}

fn layout_circular(graph: &mut FlowGraph) {
    let n = graph.nodes.len();
    if n==0 { return; }
    if n==1 { graph.nodes[0].x=0.0; graph.nodes[0].y=0.0; return; }
    let radius = (n as f64 * 232.0 / (2.0*std::f64::consts::PI)).max(180.0);
    for (i, node) in graph.nodes.iter_mut().enumerate() {
        let angle = 2.0*std::f64::consts::PI * i as f64 / n as f64 - std::f64::consts::PI/2.0;
        node.x = angle.cos()*radius;
        node.y = angle.sin()*radius;
        node.width = 200.0; node.height = 72.0;
    }
}

fn layout_force(graph: &mut FlowGraph) {
    // seed circular then simple iterations
    layout_circular(graph);
    let n = graph.nodes.len();
    if n<=1 { return; }
    // naive force for 60 iters
    for iter in 0..60 {
        let mut disp: HashMap<String, (f64,f64)> = HashMap::new();
        for nd in &graph.nodes { disp.insert(nd.id.clone(), (0.0,0.0)); }
        let k = 220.0;
        for i in 0..n {
            for j in (i+1)..n {
                let a = &graph.nodes[i];
                let b = &graph.nodes[j];
                let dx = a.x - b.x;
                let dy = a.y - b.y;
                let dist = (dx*dx+dy*dy).sqrt().max(1.0);
                let f = k*k/dist;
                let fx = dx/dist*f;
                let fy = dy/dist*f;
                *disp.get_mut(&a.id).unwrap() = (disp[&a.id].0+fx, disp[&a.id].1+fy);
                *disp.get_mut(&b.id).unwrap() = (disp[&b.id].0-fx, disp[&b.id].1-fy);
            }
        }
        for e in &graph.edges {
            let s = graph.nodes.iter().find(|x| x.id==e.source).cloned();
            let t = graph.nodes.iter().find(|x| x.id==e.target).cloned();
            if let (Some(s), Some(t)) = (s,t) {
                let dx = s.x - t.x;
                let dy = s.y - t.y;
                let dist = (dx*dx+dy*dy).sqrt().max(1.0);
                let f = dist*dist/k*0.08;
                let fx = dx/dist*f;
                let fy = dy/dist*f;
                if let Some(d) = disp.get_mut(&s.id) { d.0-=fx; d.1-=fy; }
                if let Some(d) = disp.get_mut(&t.id) { d.0+=fx; d.1+=fy; }
            }
        }
        let temp = (1.0 - iter as f64/60.0)*18.0;
        for nd in &mut graph.nodes {
            let (dx,dy) = disp[&nd.id];
            let len = (dx*dx+dy*dy).sqrt().max(0.1);
            let lim = len.min(temp);
            nd.x += dx/len*lim;
            nd.y += dy/len*lim;
        }
    }
    let cx: f64 = graph.nodes.iter().map(|n| n.x).sum::<f64>()/n as f64;
    let cy: f64 = graph.nodes.iter().map(|n| n.y).sum::<f64>()/n as f64;
    for nd in &mut graph.nodes { nd.x-=cx; nd.y-=cy; }
}

// ── core build ──────────────────────────────────────────────────────────────

fn build_graph(nodes: &[Node], opts: &FlowAnalyzeArgs) -> FlowGraph {
    let layout = opts.layout.clone().unwrap_or_else(|| "hierarchical".into());
    let include_seq = opts.include_sequence.unwrap_or(true);
    let include_auth = opts.include_auth.unwrap_or(true);
    let include_data = opts.include_data_flow.unwrap_or(true);

    let mut flat: Vec<FlatReq> = Vec::new();
    flatten_nodes(nodes, "", &mut flat);

    // nodes
    let mut graph_nodes: Vec<FlowNode> = Vec::new();
    let mut var_producers: HashMap<String, String> = HashMap::new();
    let mut id_by_flat_idx: Vec<String> = Vec::new();

    for (idx, r) in flat.iter().enumerate() {
        let nid = format!("req_{}_{}_{}", slug(&r.node_name), slug(&r.name), &r.id[..6.min(r.id.len())]);
        // ensure unique if collision: append idx
        let nid = if id_by_flat_idx.contains(&nid) { format!("{}_{}", nid, idx) } else { nid };
        id_by_flat_idx.push(nid.clone());
        graph_nodes.push(FlowNode {
            id: nid.clone(),
            label: if r.name.is_empty() { r.node_name.clone() } else { r.name.clone() },
            node_type: "request".into(),
            method: Some(r.method.clone()),
            url: r.url.clone(),
            collection_id: r.node_name.clone(),
            request_id: r.id.clone(),
            x: 0.0, y: 0.0, width: 200.0, height: 72.0,
            color: method_color(&r.method).into(),
        });
        for v in extract_set_vars(&r.pre_script).into_iter().chain(extract_set_vars(&r.test_script)) {
            var_producers.entry(v).or_insert_with(|| nid.clone());
        }
    }

    // group for sequence
    let mut by_top: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, r) in flat.iter().enumerate() { by_top.entry(r.top_name.clone()).or_default().push(idx); }

    let mut edges: Vec<FlowEdge> = Vec::new();

    for (idx, r) in flat.iter().enumerate() {
        let target = id_by_flat_idx[idx].clone();
        let content = content_of(r);
        let vars = extract_mustaches(&content);

        if include_data {
            for v in &vars {
                if let Some(src) = var_producers.get(v) {
                    if src != &target {
                        let eid = format!("data_{}__{}__{}", src, target, v);
                        if !edges.iter().any(|e| e.id==eid) {
                            edges.push(FlowEdge { id: eid, source: src.clone(), target: target.clone(), edge_type: "dataFlow".into(), label: Some(v.clone()), animated: true, color: edge_color("dataFlow").into() });
                        }
                    }
                }
            }
        }
        if include_auth {
            let auth_vars: Vec<String> = vars.iter().filter(|v| {
                let lv = v.to_ascii_lowercase();
                lv=="authtoken"||lv=="apikey"||lv=="accesstoken"||lv=="token"||lv=="bearer"||lv=="jwt"
            }).cloned().collect();
            for v in auth_vars {
                let src = var_producers.get(&v).or_else(|| var_producers.get("authToken")).or_else(|| var_producers.get("token"));
                if let Some(s) = src {
                    if s != &target {
                        let eid = format!("auth_{}__{}", s, target);
                        if !edges.iter().any(|e| e.id==eid) {
                            edges.push(FlowEdge { id: eid, source: s.clone(), target: target.clone(), edge_type: "authFlow".into(), label: Some("auth".into()), animated: false, color: edge_color("authFlow").into() });
                        }
                    }
                }
            }
        }
    }

    if include_seq {
        for (_, group) in by_top {
            for w in group.windows(2) {
                let a = id_by_flat_idx[w[0]].clone();
                let b = id_by_flat_idx[w[1]].clone();
                let eid = format!("seq_{}__{}", a, b);
                if !edges.iter().any(|e| e.id==eid) {
                    edges.push(FlowEdge { id: eid, source: a, target: b, edge_type: "sequence".into(), label: Some("1".into()), animated: false, color: edge_color("sequence").into() });
                }
            }
        }
        // fix sequence labels incremental per source
        let mut seq_counter: HashMap<String, usize> = HashMap::new();
        for e in edges.iter_mut().filter(|e| e.edge_type=="sequence") {
            let c = seq_counter.entry(e.source.clone()).or_insert(0);
            *c+=1;
            e.label = Some(c.to_string());
        }
    }

    let mut graph = FlowGraph { nodes: graph_nodes, edges, layout: layout.clone() };
    apply_layout(&mut graph, &layout);
    graph
}

// ── tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn flow_analyze(args: Option<FlowAnalyzeArgs>) -> Result<FlowGraph, String> {
    let opts = args.unwrap_or(FlowAnalyzeArgs { dir: None, collection_id: None, layout: None, include_sequence: None, include_auth: None, include_data_flow: None });
    let dir = opts.dir.clone().map(PathBuf::from).unwrap_or_else(default_workspace);
    let nodes = collections::read_tree(&dir)?;

    // if collection_id filter requested: try to find subtree
    if let Some(cid) = opts.collection_id.clone() {
        // We treat cid as folder name slug? For file-based collections, ids are not persisted.
        // Fallback: filter by folder name containing cid
        let filtered: Vec<Node> = nodes.iter().filter(|n| match n {
            Node::Folder { name, .. } => slug(name) == slug(&cid) || name == &cid,
            Node::Request { name, .. } => slug(name) == slug(&cid),
        }).cloned().collect();
        if !filtered.is_empty() {
            return Ok(build_graph(&filtered, &opts));
        }
        // try recursive search
        fn find(nodes: &[Node], target: &str) -> Option<Vec<Node>> {
            for n in nodes {
                match n {
                    Node::Folder { name, children } => {
                        if slug(name) == slug(target) || name==target {
                            return Some(children.clone());
                        }
                        if let Some(found) = find(children, target) { return Some(found); }
                    }
                    Node::Request { name, .. } => {
                        if slug(name)==slug(target) { return Some(vec![n.clone()]); }
                    }
                }
            }
            None
        }
        if let Some(sub) = find(&nodes, &cid) {
            return Ok(build_graph(&sub, &opts));
        }
    }

    Ok(build_graph(&nodes, &opts))
}

#[tauri::command]
pub fn flow_export_svg(args: Option<FlowAnalyzeArgs>, title: Option<String>) -> Result<String, String> {
    let graph = flow_analyze(args)?;
    Ok(render_svg(&graph, title.as_deref().unwrap_or("APIForge — Connection Flow")))
}

fn render_svg(graph: &FlowGraph, title: &str) -> String {
    if graph.nodes.is_empty() {
        return format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><text x="50%" y="50%" text-anchor="middle" fill="#8f8f8f" font-family="sans-serif" font-size="14">No requests to visualize</text></svg>"##);
    }
    let pad = 80.0;
    let min_x = graph.nodes.iter().map(|n| n.x).fold(f64::INFINITY, f64::min) - pad;
    let max_x = graph.nodes.iter().map(|n| n.x + n.width).fold(f64::NEG_INFINITY, f64::max) + pad;
    let min_y = graph.nodes.iter().map(|n| n.y).fold(f64::INFINITY, f64::min) - pad;
    let max_y = graph.nodes.iter().map(|n| n.y + n.height).fold(f64::NEG_INFINITY, f64::max) + pad;
    let w = max_x - min_x;
    let h = max_y - min_y;
    let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;");
    let node_map: HashMap<String, &FlowNode> = graph.nodes.iter().map(|n| (n.id.clone(), n)).collect();
    let mut edges_svg = String::new();
    for e in &graph.edges {
        if let (Some(s), Some(t)) = (node_map.get(&e.source), node_map.get(&e.target)) {
            let sx = s.x + s.width/2.0; let sy = s.y + s.height/2.0;
            let tx = t.x + t.width/2.0; let ty = t.y + t.height/2.0;
            let dx = tx - sx; let dy = ty - sy;
            let dist = (dx*dx+dy*dy).sqrt().max(1.0);
            let off = dist*0.28_f64.min(90.0);
            let (c1x,c1y,c2x,c2y) = if dy.abs() > dx.abs() {
                (sx, sy+dy.signum()*off, tx, ty-dy.signum()*off)
            } else { (sx+dx.signum()*off, sy, tx-dx.signum()*off, ty) };
            let d = format!("M {} {} C {} {}, {} {}, {} {}", sx,sy,c1x,c1y,c2x,c2y,tx,ty);
            let marker = match e.edge_type.as_str() { "authFlow"=>"url(#arrow-auth)", "sequence"=>"url(#arrow-seq)", "errorFlow"=>"url(#arrow-err)", _=>"url(#arrow-data)" };
            let dash = if e.edge_type=="sequence" { " stroke-dasharray=\"6 4\"" } else { "" };
            let sw = if e.edge_type=="sequence" { "1.4" } else { "2" };
            edges_svg.push_str(&format!(r##"<path d="{d}" fill="none" stroke="{}" stroke-width="{sw}" marker-end="{marker}"{dash} opacity="0.95"/>"##, esc(&e.color)));
            if let Some(label) = &e.label {
                let mx = (s.x + t.x + s.width)/2.0;
                let my = (s.y + t.y)/2.0 - 6.0;
                edges_svg.push_str(&format!(r##"<text x="{mx}" y="{my}" text-anchor="middle" font-size="10" font-family="JetBrains Mono, monospace" fill="{}">{}</text>"##, esc(&e.color), esc(label)));
            }
        }
    }
    let mut nodes_svg = String::new();
    for n in &graph.nodes {
        let method = n.method.clone().unwrap_or_else(|| "REQ".into()).to_ascii_uppercase();
        let bg = &n.color;
        nodes_svg.push_str(&format!(
            r##"<g transform="translate({},{})"><rect width="{}" height="{}" rx="4" fill="#0a0a0a" stroke="#262626" stroke-width="1.2"/><rect x="8" y="10" width="52" height="16" rx="3" fill="{}1A" stroke="{}33"/><text x="12" y="21.5" font-size="10" font-weight="700" font-family="JetBrains Mono, monospace" fill="{}">{}</text><text x="68" y="21.5" font-size="11" font-weight="600" font-family="sans-serif" fill="#ededed">{}</text><text x="8" y="42" font-size="10" font-family="JetBrains Mono, monospace" fill="#8f8f8f">{}</text></g>"##,
            n.x, n.y, n.width, n.height, bg, bg, bg, esc(&method), esc(&truncate(&n.label,18)), esc(&truncate(&n.url,28))
        ));
    }
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{min_x} {min_y} {w} {h}"><rect x="{min_x}" y="{min_y}" width="{w}" height="{h}" fill="#000000"/><defs><marker id="arrow-data" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4d9fff"/></marker><marker id="arrow-auth" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb224"/></marker><marker id="arrow-seq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#3d3d3d"/></marker><marker id="arrow-err" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ff4d4f"/></marker></defs>{edges_svg}{nodes_svg}<text x="{}" y="{}" text-anchor="middle" font-size="13" font-weight="600" font-family="sans-serif" fill="#ededed">{}</text></svg>"##,
        (min_x+w/2.0), min_y+24.0, esc(title)
    )
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() > n { s.chars().take(n-1).collect::<String>() + "…" } else { s.to_string() }
}
