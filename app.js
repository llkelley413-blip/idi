(() => {
"use strict";

const $ = (id) => document.getElementById(id);
const state = {
  xmlDoc: null,
  fileName: "Place.rbxlx",
  selectedItem: null,
  expanded: new Set(),
  activeTab: "Home",
  activeTool: "Select",
  dirty: false,
  pointer: null,
  recoveryIntervalMinutes: 5,
  autoRecoveryEnabled: true,
  showToolLabels: true,
  lastRecovery: 0,
  viewport: { panX: 0, panY: 0, zoom: 1 },
};

const icons = {
  Workspace:"🌐", Model:"◫", Folder:"▰", Part:"◼", MeshPart:"◆",
  Script:"▤", LocalScript:"▤", ModuleScript:"▤", RemoteEvent:"↯", RemoteFunction:"⇄",
  ServerScriptService:"⚙", ReplicatedStorage:"▣", ServerStorage:"▣",
  StarterGui:"▱", StarterPlayer:"♟", Lighting:"☀", SoundService:"♫",
  ScreenGui:"▱", ImageLabel:"▧", Decal:"▧", Sound:"♫"
};

const ribbonSpec = {
  Home: [
    ["Transform", [["Select","↖"],["Move","↔"],["Scale","↗"],["Rotate","⟳"]]],
    ["Insert", [["Part","◼"],["Folder","▰"],["Model","◫"]]],
    ["Organize", [["Group","▣"],["Ungroup","▢"],["Anchor","⚓"]]],
    ["Windows", [["Toolbox","🧰"],["Explorer","☷"],["Properties","☰"]]]
  ],
  Model: [
    ["Transform", [["Select","↖"],["Move","↔"],["Scale","↗"],["Rotate","⟳"],["Pivot","⊙"]]],
    ["Insert", [["Part","◼"],["Folder","▰"],["Model","◫"]]],
    ["Edit", [["Group","▣"],["Ungroup","▢"],["Anchor","⚓"]]]
  ],
  Avatar: [
    ["Avatar", [["Rig Builder","♟"],["Animation","▶"],["Accessory","◇"]]],
    ["Transform", [["Move","↔"],["Scale","↗"],["Rotate","⟳"]]]
  ],
  UI: [
    ["UI", [["ScreenGui","▱"],["Frame","□"],["TextLabel","T"],["ImageLabel","▧"]]],
    ["Layout", [["UIListLayout","≡"],["UIPadding","↔"]]]
  ],
  Script: [
    ["Scripts", [["Script","▤"],["LocalScript","▤"],["ModuleScript","▤"]]],
    ["Tools", [["Find","⌕"],["Command Bar",">_"],["Output","!"]]]
  ],
  Plugins: [
    ["Plugins", [["Plugin Manager","🧩"],["Plugin Toolbar","▦"],["Reload","↻"]]]
  ]
};

function addOutput(message, level="info") {
  const log = $("outputLog");
  if (!log) return;
  const line = document.createElement("div");
  line.className = `outputLine ${level}`;
  const t = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
  line.innerHTML = `<span class="outputTime">${t}</span>${String(message).replaceAll("<","&lt;").replaceAll(">","&gt;")}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}
function setStatus(msg) {
  $("statusText").textContent = msg;
  addOutput(msg, "info");
}

function setDirty(v=true) {
  state.dirty = v;
  $("dirtyDot").classList.toggle("on", v);
}

function newReferent() {
  return "RBX" + crypto.randomUUID().replaceAll("-", "").toUpperCase();
}

function directChildren(el, tag=null) {
  return [...el.children].filter(c => !tag || c.tagName === tag);
}

function directChild(el, tag) {
  return directChildren(el, tag)[0] || null;
}

function escapeXmlText(s) {
  return s;
}

function makeXmlDocument() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<roblox version="4">
  <Item class="Workspace" referent="${newReferent()}">
    <Properties>
      <string name="Name">Workspace</string>
      <bool name="Archivable">true</bool>
    </Properties>
  </Item>
  <Item class="ReplicatedStorage" referent="${newReferent()}"><Properties><string name="Name">ReplicatedStorage</string></Properties></Item>
  <Item class="ServerStorage" referent="${newReferent()}"><Properties><string name="Name">ServerStorage</string></Properties></Item>
  <Item class="ServerScriptService" referent="${newReferent()}"><Properties><string name="Name">ServerScriptService</string></Properties></Item>
  <Item class="StarterGui" referent="${newReferent()}"><Properties><string name="Name">StarterGui</string></Properties></Item>
  <Item class="StarterPlayer" referent="${newReferent()}"><Properties><string name="Name">StarterPlayer</string></Properties></Item>
  <Item class="Lighting" referent="${newReferent()}"><Properties><string name="Name">Lighting</string></Properties></Item>
  <Item class="SoundService" referent="${newReferent()}"><Properties><string name="Name">SoundService</string></Properties></Item>
</roblox>`;
  return new DOMParser().parseFromString(xml, "application/xml");
}

function initializeNewProject() {
  state.xmlDoc = makeXmlDocument();
  state.fileName = "Place.rbxlx";
  state.selectedItem = null;
  state.expanded.clear();
  [...state.xmlDoc.documentElement.children].filter(n => n.tagName === "Item").forEach(n => state.expanded.add(n.getAttribute("referent")));
  setDirty(false);
  renderAll();
  setStatus("New Roblox XML place created");
  writeRecovery(true);
}

function hasParserError(doc) {
  return doc.getElementsByTagName("parsererror").length > 0;
}

function validateXml(doc) {
  const problems = [];
  const root = doc?.documentElement;
  if (!root || root.tagName !== "roblox") problems.push("Root element must be <roblox>.");
  if (root && root.getAttribute("version") !== "4") problems.push("Roblox XML version should be 4.");
  const refs = new Set();
  const items = root ? [...root.querySelectorAll("Item")] : [];
  for (const item of items) {
    const ref = item.getAttribute("referent");
    if (!ref) problems.push(`Item ${item.getAttribute("class") || "(unknown)"} is missing referent.`);
    else if (refs.has(ref)) problems.push(`Duplicate referent: ${ref}`);
    else refs.add(ref);
    if (!directChild(item, "Properties")) problems.push(`${item.getAttribute("class")} ${ref || ""} has no Properties element.`);
  }
  for (const refNode of root ? [...root.querySelectorAll("Ref")] : []) {
    const value = refNode.textContent.trim();
    if (value && value !== "null" && !refs.has(value)) problems.push(`Dangling Ref property points to ${value}.`);
  }
  return problems;
}

function renderRibbon() {
  const r = $("ribbon");
  r.innerHTML = "";
  const groups = ribbonSpec[state.activeTab] || [];
  for (const [groupName, buttons] of groups) {
    const g = document.createElement("div");
    g.className = "ribbonGroup";
    g.dataset.group = groupName;
    for (const [name, glyph] of buttons) {
      const b = document.createElement("button");
      b.dataset.tool = name;
      b.innerHTML = `<span class="glyph">${glyph}</span><span>${name}</span>`;
      if (state.activeTool === name) b.classList.add("active");
      b.addEventListener("click", () => handleRibbonAction(name));
      g.appendChild(b);
    }
    r.appendChild(g);
  }
}

function handleRibbonAction(name) {
  if (["Select","Move","Scale","Rotate","Pivot"].includes(name)) {
    state.activeTool = name;
    $("toolStatus").textContent = name;
    renderRibbon();
    setStatus(`${name} tool active`);
    return;
  }
  if (name === "Toolbox") {
    $("toolboxPanel").classList.remove("hidden");
    return;
  }
  if (["Folder","Model","Part","Script","LocalScript","ModuleScript","ScreenGui","Frame","TextLabel","ImageLabel"].includes(name)) {
    insertObject(name);
    return;
  }
  if (name === "Group") return groupSelection();
  if (name === "Ungroup") return ungroupSelection();
  if (name === "Anchor") return toggleAnchored();
  if (name === "Explorer" || name === "Properties") {
    setStatus(`${name} is already visible`);
    return;
  }
  if (name === "Plugin Manager" || name === "Plugin Toolbar" || name === "Reload") {
    alert("Studio plugins require the official Studio Plugin runtime. This editor preserves place/plugin-related data where serializable, but cannot execute Plugin-security APIs in Safari.");
    return;
  }
  alert(`${name} is represented in the Studio-compatible ribbon but is not implemented in v0.1 yet.`);
}

function getName(item) {
  const props = directChild(item, "Properties");
  if (props) {
    const n = directChildren(props).find(p => p.getAttribute("name") === "Name");
    if (n) return n.textContent || item.getAttribute("class");
  }
  return item.getAttribute("class") || "Instance";
}

function setName(item, value) {
  const props = ensureProperties(item);
  let p = directChildren(props).find(n => n.getAttribute("name") === "Name");
  if (!p) {
    p = state.xmlDoc.createElement("string");
    p.setAttribute("name","Name");
    props.prepend(p);
  }
  p.textContent = value;
}

function ensureProperties(item) {
  let props = directChild(item, "Properties");
  if (!props) {
    props = state.xmlDoc.createElement("Properties");
    item.prepend(props);
  }
  return props;
}

function explorerMatches(item, query) {
  if (!query) return true;
  const name = getName(item).toLowerCase();
  const cls = (item.getAttribute("class") || "").toLowerCase();
  if (name.includes(query) || cls.includes(query)) return true;
  return directChildren(item, "Item").some(child => explorerMatches(child, query));
}
function renderExplorer() {
  const tree = $("explorerTree");
  tree.innerHTML = "";
  if (!state.xmlDoc) return;
  const query = ($("explorerSearch")?.value || "").trim().toLowerCase();
  for (const item of directChildren(state.xmlDoc.documentElement, "Item")) {
    if (!explorerMatches(item, query)) continue;
    renderTreeItem(item, tree, 0, query);
  }
}

function renderTreeItem(item, host, depth, query="") {
  const ref = item.getAttribute("referent");
  const children = directChildren(item, "Item");
  const row = document.createElement("div");
  row.className = "treeRow";
  if (state.selectedItem === item) row.classList.add("selected");
  row.style.paddingLeft = `${depth * 14}px`;

  const arrow = document.createElement("span");
  arrow.className = "treeArrow";
  arrow.textContent = children.length ? (state.expanded.has(ref) ? "▾" : "▸") : "";
  arrow.addEventListener("click", e => {
    e.stopPropagation();
    if (!children.length) return;
    state.expanded.has(ref) ? state.expanded.delete(ref) : state.expanded.add(ref);
    renderExplorer();
  });

  const icon = document.createElement("span");
  icon.className = "treeIcon";
  icon.textContent = icons[item.getAttribute("class")] || "◇";

  const name = document.createElement("span");
  name.className = "treeName";
  name.textContent = getName(item);

  row.append(arrow, icon, name);
  row.addEventListener("click", () => selectItem(item));
  row.addEventListener("dblclick", () => {
    const cls = item.getAttribute("class");
    if (["Script","LocalScript","ModuleScript"].includes(cls)) openScript(item);
    else if (children.length) {
      state.expanded.has(ref) ? state.expanded.delete(ref) : state.expanded.add(ref);
      renderExplorer();
    }
  });
  host.appendChild(row);

  if (children.length && (state.expanded.has(ref) || query)) {
    for (const child of children) {
      if (!query || explorerMatches(child, query)) renderTreeItem(child, host, depth + 1, query);
    }
  }
}

function selectItem(item) {
  state.selectedItem = item;
  $("selectionText").textContent = `${item.getAttribute("class")} • ${getName(item)}`;
  renderExplorer();
  renderProperties();
  drawViewport();
}

function propertySimpleValue(prop) {
  const tag = prop.tagName;
  if (["string","bool","float","double","int","int64","token","ProtectedString","BinaryString","Ref"].includes(tag)) {
    return prop.textContent;
  }
  if (tag === "Content" || tag === "ContentId") {
    const url = directChild(prop, "url");
    return url ? url.textContent : prop.textContent;
  }
  return null;
}

function renderProperties() {
  const list = $("propertiesList");
  list.innerHTML = "";
  const item = state.selectedItem;
  if (!item) {
    list.innerHTML = `<div class="smallNote" style="padding:12px">Select an Instance in Explorer.</div>`;
    return;
  }
  const filter = $("propertySearch").value.toLowerCase().trim();
  const classRow = makeReadOnlyProperty("ClassName", item.getAttribute("class"));
  if (!filter || "classname".includes(filter)) list.appendChild(classRow);

  const props = ensureProperties(item);
  for (const prop of directChildren(props)) {
    const pname = prop.getAttribute("name") || prop.tagName;
    if (filter && !pname.toLowerCase().includes(filter)) continue;
    list.appendChild(makePropertyEditor(item, prop));
  }
}

function makeReadOnlyProperty(name, value) {
  const row = document.createElement("div");
  row.className = "propertyRow";
  row.innerHTML = `<div class="propertyName">${name}</div><div class="propertyValue"><input value="${String(value).replaceAll('"',"&quot;")}" disabled /></div>`;
  return row;
}

function makePropertyEditor(item, prop) {
  const row = document.createElement("div");
  row.className = "propertyRow";
  const nameCell = document.createElement("div");
  nameCell.className = "propertyName";
  nameCell.textContent = prop.getAttribute("name") || prop.tagName;
  nameCell.title = prop.tagName;

  const valueCell = document.createElement("div");
  valueCell.className = "propertyValue";
  const simple = propertySimpleValue(prop);

  if (simple !== null) {
    if (prop.tagName === "bool") {
      const select = document.createElement("select");
      select.innerHTML = `<option value="true">true</option><option value="false">false</option>`;
      select.value = simple.trim() === "true" ? "true" : "false";
      select.addEventListener("change", () => {
        prop.textContent = select.value;
        propertyChanged(item, prop);
      });
      valueCell.appendChild(select);
    } else {
      const input = document.createElement("input");
      input.value = simple;
      input.addEventListener("change", () => {
        if ((prop.tagName === "Content" || prop.tagName === "ContentId") && directChild(prop, "url")) {
          directChild(prop,"url").textContent = input.value;
        } else prop.textContent = input.value;
        propertyChanged(item, prop);
      });
      valueCell.appendChild(input);
    }
  } else if (["Vector3","Color3","Vector2"].includes(prop.tagName)) {
    const keys = prop.tagName === "Vector2" ? ["X","Y"] : prop.tagName === "Color3" ? ["R","G","B"] : ["X","Y","Z"];
    const grid = document.createElement("div");
    grid.className = "vectorGrid";
    grid.style.gridTemplateColumns = `repeat(${keys.length},1fr)`;
    for (const key of keys) {
      let node = directChild(prop, key);
      if (!node) { node = state.xmlDoc.createElement(key); node.textContent = "0"; prop.appendChild(node); }
      const input = document.createElement("input");
      input.value = node.textContent;
      input.placeholder = key;
      input.addEventListener("change", () => { node.textContent = input.value; propertyChanged(item, prop); });
      grid.appendChild(input);
    }
    valueCell.appendChild(grid);
  } else if (prop.tagName === "CoordinateFrame") {
    const grid = document.createElement("div");
    grid.className = "vectorGrid";
    for (const key of ["X","Y","Z"]) {
      let node = directChild(prop,key);
      if (!node) { node = state.xmlDoc.createElement(key); node.textContent = "0"; prop.appendChild(node); }
      const input = document.createElement("input");
      input.value = node.textContent; input.placeholder = key;
      input.addEventListener("change", () => { node.textContent = input.value; propertyChanged(item,prop); });
      grid.appendChild(input);
    }
    valueCell.appendChild(grid);
  } else {
    const input = document.createElement("input");
    input.value = `[${prop.tagName}]`;
    input.disabled = true;
    valueCell.appendChild(input);
  }

  row.append(nameCell, valueCell);
  return row;
}

function propertyChanged(item, prop) {
  setDirty(true);
  if (prop.getAttribute("name") === "Name") renderExplorer();
  drawViewport();
  queueRecovery();
}

function createProperty(tag, name, value) {
  const p = state.xmlDoc.createElement(tag);
  p.setAttribute("name", name);
  if (value !== undefined) p.textContent = String(value);
  return p;
}
function createContentIdProperty(name, value) {
  const p = state.xmlDoc.createElement("ContentId");
  p.setAttribute("name", name);
  const url = state.xmlDoc.createElement("url");
  url.textContent = String(value ?? "");
  p.appendChild(url);
  return p;
}

function createVectorProperty(tag, name, values) {
  const p = state.xmlDoc.createElement(tag);
  p.setAttribute("name",name);
  Object.entries(values).forEach(([k,v]) => {
    const n = state.xmlDoc.createElement(k); n.textContent = String(v); p.appendChild(n);
  });
  return p;
}

function createCFrameProperty(name, x=0,y=0,z=0) {
  const p = state.xmlDoc.createElement("CoordinateFrame");
  p.setAttribute("name",name);
  const vals = {X:x,Y:y,Z:z,R00:1,R01:0,R02:0,R10:0,R11:1,R12:0,R20:0,R21:0,R22:1};
  Object.entries(vals).forEach(([k,v]) => { const n=state.xmlDoc.createElement(k);n.textContent=String(v);p.appendChild(n); });
  return p;
}

function createItem(className, name=className) {
  const item = state.xmlDoc.createElement("Item");
  item.setAttribute("class", className);
  item.setAttribute("referent", newReferent());
  const props = state.xmlDoc.createElement("Properties");
  props.appendChild(createProperty("string","Name",name));
  props.appendChild(createProperty("bool","Archivable","true"));

  if (["Script","LocalScript","ModuleScript"].includes(className)) {
    props.appendChild(createProperty("bool","Disabled","false"));
    props.appendChild(createProperty("ProtectedString","Source", className === "ModuleScript" ? "return {}\n" : 'print("Hello from Studio Bridge Mobile")\n'));
  }
  if (className === "Part") {
    props.appendChild(createProperty("bool","Anchored","true"));
    props.appendChild(createProperty("bool","CanCollide","true"));
    props.appendChild(createProperty("float","Transparency","0"));
    props.appendChild(createVectorProperty("Vector3","Size",{X:4,Y:1,Z:4}));
    props.appendChild(createCFrameProperty("CFrame",0,2,0));
    props.appendChild(createVectorProperty("Color3","Color",{R:0.64,G:0.64,B:0.64}));
    props.appendChild(createProperty("token","Material","256"));
  }
  if (className === "BoolValue") props.appendChild(createProperty("bool","Value","false"));
  if (className === "StringValue") props.appendChild(createProperty("string","Value",""));
  if (className === "NumberValue") props.appendChild(createProperty("double","Value","0"));
  if (className === "ScreenGui") props.appendChild(createProperty("bool","Enabled","true"));
  if (className === "Frame") {
    props.appendChild(createProperty("float","BackgroundTransparency","0"));
    props.appendChild(createProperty("bool","Visible","true"));
  }
  item.appendChild(props);
  return item;
}

function bestParentForClass(className) {
  if (state.selectedItem && ["Folder","Model","Workspace","ReplicatedStorage","ServerStorage","ServerScriptService","StarterGui","StarterPlayer","ScreenGui","Frame"].includes(state.selectedItem.getAttribute("class"))) {
    return state.selectedItem;
  }
  const tops = directChildren(state.xmlDoc.documentElement,"Item");
  const find = cls => tops.find(i => i.getAttribute("class") === cls);
  if (["Script","RemoteEvent","RemoteFunction","Folder","Model"].includes(className)) return find("ServerScriptService") || find("Workspace");
  if (className === "LocalScript") return find("StarterPlayer") || find("StarterGui");
  if (className === "ScreenGui") return find("StarterGui");
  return find("Workspace") || state.xmlDoc.documentElement;
}

function insertObject(className) {
  if (!state.xmlDoc) initializeNewProject();
  const parent = bestParentForClass(className);
  const item = createItem(className);
  parent.appendChild(item);
  if (parent.tagName === "Item") state.expanded.add(parent.getAttribute("referent"));
  setDirty(true);
  renderExplorer();
  selectItem(item);
  queueRecovery();
  setStatus(`Inserted ${className}`);
}

function groupSelection() {
  const item = state.selectedItem;
  if (!item || item.parentElement.tagName !== "Item") {
    setStatus("Select an Instance with a parent to group");
    return;
  }
  const parent = item.parentElement;
  const model = createItem("Model","Model");
  parent.insertBefore(model,item);
  model.appendChild(item);
  state.expanded.add(model.getAttribute("referent"));
  setDirty(true); renderExplorer(); selectItem(model); queueRecovery();
}

function ungroupSelection() {
  const item = state.selectedItem;
  if (!item || item.getAttribute("class") !== "Model") { setStatus("Select a Model to ungroup"); return; }
  const parent = item.parentElement;
  const kids = directChildren(item,"Item");
  for (const kid of kids) parent.insertBefore(kid,item);
  parent.removeChild(item);
  state.selectedItem = null;
  setDirty(true); renderAll(); queueRecovery();
}

function toggleAnchored() {
  const item = state.selectedItem;
  if (!item || !["Part","MeshPart"].includes(item.getAttribute("class"))) { setStatus("Select a Part or MeshPart"); return; }
  const props = ensureProperties(item);
  let p = directChildren(props).find(n => n.getAttribute("name") === "Anchored");
  if (!p) { p=createProperty("bool","Anchored","true"); props.appendChild(p); }
  p.textContent = p.textContent.trim() === "true" ? "false" : "true";
  setDirty(true); renderProperties(); queueRecovery();
}

function openScript(item) {
  const props = ensureProperties(item);
  let source = directChildren(props).find(n => n.getAttribute("name") === "Source");
  if (!source) { source = createProperty("ProtectedString","Source",""); props.appendChild(source); }
  $("scriptTitle").textContent = `${getName(item)} — ${item.getAttribute("class")}`;
  $("scriptEditor").value = source.textContent;
  $("scriptPane").classList.remove("hidden");
  $("scriptEditor").focus();
  $("scriptEditor").oninput = () => {
    source.textContent = $("scriptEditor").value;
    setDirty(true); queueRecovery();
  };
}

function renderAll() {
  renderRibbon(); renderExplorer(); renderProperties(); drawViewport();
}

function serializeXml() {
  const body = new XMLSerializer().serializeToString(state.xmlDoc);
  return body.startsWith("<?xml") ? body : `<?xml version="1.0" encoding="utf-8"?>\n${body}`;
}

function downloadText(text, filename, mime="application/xml") {
  const blob = new Blob([text], {type:mime});
  const file = new File([blob], filename, {type:mime});
  if (navigator.canShare && navigator.canShare({files:[file]})) {
    navigator.share({files:[file], title:filename}).catch(() => fallbackDownload(blob,filename));
  } else fallbackDownload(blob, filename);
}

function fallbackDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function openFile(file) {
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  if (["rbxl","rbxm"].includes(ext)) {
    alert("Binary Roblox files are recognized, but v0.1 does not deserialize them yet. Use Roblox XML .rbxlx/.rbxmx for this build. Binary support is on the compatibility roadmap.");
    return;
  }
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text,"application/xml");
  if (hasParserError(doc) || doc.documentElement?.tagName !== "roblox") {
    alert("This does not appear to be a valid Roblox XML place/model file.");
    return;
  }
  state.xmlDoc = doc;
  state.fileName = file.name;
  state.selectedItem = null; state.expanded.clear();
  directChildren(doc.documentElement,"Item").forEach(i => state.expanded.add(i.getAttribute("referent")));
  const problems = validateXml(doc);
  setDirty(false); renderAll(); writeRecovery(true);
  setStatus(problems.length ? `Opened with ${problems.length} compatibility warning(s)` : `Opened ${file.name}`);
  if (problems.length) console.warn("[StudioBridge] Compatibility warnings:", problems);
}

function showSaveAs(backup=false) {
  const ext = state.fileName.toLowerCase().endsWith(".rbxmx") ? "rbxmx" : "rbxlx";
  const base = state.fileName.replace(/\.(rbxlx|rbxmx|xml)$/i,"") || "Place";
  $("saveName").value = backup ? `${base}_backup_${timestampCompact()}.${ext}` : `${base}.${ext}`;
  $("saveFormat").value = ext;
  $("saveDialog").showModal();
}

function saveNow(filename=null) {
  if (!state.xmlDoc) return;
  const problems = validateXml(state.xmlDoc);
  if (problems.length) {
    const go = confirm(`Compatibility validator found ${problems.length} warning(s).\n\n${problems.slice(0,8).join("\n")}\n\nSave anyway?`);
    if (!go) return;
  }
  const name = filename || state.fileName || "Place.rbxlx";
  downloadText(serializeXml(), name);
  state.fileName = name;
  setDirty(false);
  setStatus(`Saved ${name}`);
}

function timestampCompact() {
  const d = new Date(), p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* IndexedDB recovery */
const DB_NAME = "StudioBridgeMobile";
const STORE = "recoveries";
function openDB() {
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE,{keyPath:"id",autoIncrement:true}); };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function writeRecovery(force=false) {
  if (!state.xmlDoc || !state.autoRecoveryEnabled) return;
  const now = Date.now();
  const interval = state.recoveryIntervalMinutes*60*1000;
  if (!force && now-state.lastRecovery < interval) return;
  state.lastRecovery=now;
  try {
    const db=await openDB(); const tx=db.transaction(STORE,"readwrite"); const store=tx.objectStore(STORE);
    store.add({time:now,name:state.fileName,xml:serializeXml()});
    const allReq=store.getAll();
    allReq.onsuccess=()=>{
      const all=allReq.result.sort((a,b)=>a.time-b.time);
      for (const old of all.slice(0,Math.max(0,all.length-20))) store.delete(old.id);
    };
  } catch(e){ console.warn("[StudioBridge] Recovery write failed",e); }
}
let recoveryTimer=null;
function queueRecovery() {
  if (!state.autoRecoveryEnabled) return;
  clearTimeout(recoveryTimer);
  recoveryTimer=setTimeout(()=>writeRecovery(false),1000);
}
async function showRecoveries() {
  const list=$("recoveryList"); list.textContent="Loading...";
  try {
    const db=await openDB();
    const req=db.transaction(STORE,"readonly").objectStore(STORE).getAll();
    req.onsuccess=()=>{
      list.innerHTML="";
      const all=req.result.sort((a,b)=>b.time-a.time);
      if (!all.length) list.innerHTML=`<div class="smallNote">No recovery snapshots yet.</div>`;
      all.forEach(entry=>{
        const row=document.createElement("div"); row.className="recoveryEntry";
        const label=document.createElement("span");
        label.textContent=`${entry.name} • ${new Date(entry.time).toLocaleString()}`;
        const btn=document.createElement("button"); btn.type="button"; btn.textContent="Open";
        btn.onclick=()=>{ loadRecovery(entry); $("recoveryDialog").close(); };
        row.append(label,btn); list.appendChild(row);
      });
    };
  } catch(e){list.textContent="Could not open recovery database."}
  $("recoveryDialog").showModal();
}
function loadRecovery(entry) {
  const doc=new DOMParser().parseFromString(entry.xml,"application/xml");
  if (hasParserError(doc)) return alert("Recovery snapshot is invalid.");
  state.xmlDoc=doc; state.fileName=entry.name; state.selectedItem=null; state.expanded.clear();
  directChildren(doc.documentElement,"Item").forEach(i=>state.expanded.add(i.getAttribute("referent")));
  setDirty(true); renderAll(); setStatus("Recovery snapshot opened");
}

/* Viewport */
function getProp(item,name) {
  const props=directChild(item,"Properties"); if(!props) return null;
  return directChildren(props).find(n=>n.getAttribute("name")===name)||null;
}
function cframePos(item) {
  const p=getProp(item,"CFrame"); if(!p) return {x:0,y:0,z:0};
  return {x:+(directChild(p,"X")?.textContent||0),y:+(directChild(p,"Y")?.textContent||0),z:+(directChild(p,"Z")?.textContent||0)};
}
function sizeOf(item) {
  const p=getProp(item,"Size"); if(!p) return {x:4,y:1,z:4};
  return {x:+(directChild(p,"X")?.textContent||4),y:+(directChild(p,"Y")?.textContent||1),z:+(directChild(p,"Z")?.textContent||4)};
}
function allParts() {
  return state.xmlDoc ? [...state.xmlDoc.querySelectorAll("Item")].filter(i=>["Part","MeshPart"].includes(i.getAttribute("class"))) : [];
}
function isoProject(x,y,z,w,h) {
  const s=26*state.viewport.zoom;
  return {
    x:w/2+state.viewport.panX + (x-z)*0.72*s,
    y:h*0.58+state.viewport.panY + (x+z)*0.35*s - y*0.8*s
  };
}
function drawViewport() {
  const c=$("viewportCanvas"), rect=c.getBoundingClientRect();
  const dpr=Math.max(1,window.devicePixelRatio||1);
  const w=Math.max(1,Math.floor(rect.width)), h=Math.max(1,Math.floor(rect.height));
  if(c.width!==w*dpr||c.height!==h*dpr){c.width=w*dpr;c.height=h*dpr}
  const ctx=c.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const grad=ctx.createLinearGradient(0,0,0,h); grad.addColorStop(0,"#60717e");grad.addColorStop(1,"#39434b");ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  // ground grid
  ctx.strokeStyle="#ffffff18";ctx.lineWidth=1;
  for(let i=-20;i<=20;i++){
    let a=isoProject(i,0,-20,w,h), b=isoProject(i,0,20,w,h); ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    a=isoProject(-20,0,i,w,h); b=isoProject(20,0,i,w,h); ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  const parts=allParts().sort((a,b)=>cframePos(a).y-cframePos(b).y);
  for(const item of parts) drawPart(ctx,item,w,h);
  if(!parts.length){ctx.fillStyle="#ffffffaa";ctx.font="14px -apple-system";ctx.textAlign="center";ctx.fillText("Insert a Part or open an RBXLX place",w/2,h/2)}
}
function drawPart(ctx,item,w,h){
  const p=cframePos(item), s=sizeOf(item), o=isoProject(p.x,p.y,p.z,w,h);
  const px=Math.max(8,(s.x+s.z)*8*state.viewport.zoom), py=Math.max(6,s.y*12*state.viewport.zoom);
  ctx.save();ctx.translate(o.x,o.y);
  ctx.fillStyle=item===state.selectedItem?"#6da7e8":"#b7bcc3";ctx.strokeStyle="#202429";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.rect(-px/2,-py,px,py);ctx.fill();ctx.stroke();
  ctx.fillStyle="#ffffff33";ctx.fillRect(-px/2,-py,px,Math.min(5,py));
  if(item===state.selectedItem){ctx.strokeStyle="#e9f4ff";ctx.lineWidth=2;ctx.strokeRect(-px/2-3,-py-3,px+6,py+6)}
  ctx.restore();
}
function snap(v,inc){inc=Math.abs(+inc||0); return inc?Math.round(v/inc)*inc:v;}
function transformSelected(dx,dy) {
  const item=state.selectedItem; if(!item||!["Part","MeshPart"].includes(item.getAttribute("class"))) return;
  const moveInc=$("moveSnap").value;
  const rotInc=$("rotateSnap").value;
  if(state.activeTool==="Move"){
    let cf=getProp(item,"CFrame"); if(!cf) {cf=createCFrameProperty("CFrame");ensureProperties(item).appendChild(cf)}
    const x=directChild(cf,"X"), z=directChild(cf,"Z");
    x.textContent=String(snap(+x.textContent+dx/26,moveInc));
    z.textContent=String(snap(+z.textContent-dy/26,moveInc));
  } else if(state.activeTool==="Scale"){
    let sz=getProp(item,"Size"); if(!sz){sz=createVectorProperty("Vector3","Size",{X:4,Y:1,Z:4});ensureProperties(item).appendChild(sz)}
    const x=directChild(sz,"X"), z=directChild(sz,"Z");
    x.textContent=String(Math.max(0.05,snap(+x.textContent+dx/26,moveInc)));
    z.textContent=String(Math.max(0.05,snap(+z.textContent-dy/26,moveInc)));
  } else if(state.activeTool==="Rotate"){
    let cf=getProp(item,"CFrame"); if(!cf){cf=createCFrameProperty("CFrame");ensureProperties(item).appendChild(cf)}
    const angle=snap(dx*1.2,rotInc)*Math.PI/180;
    const c=Math.cos(angle),s=Math.sin(angle);
    const vals={R00:c,R01:0,R02:-s,R10:0,R11:1,R12:0,R20:s,R21:0,R22:c};
    for(const [k,v] of Object.entries(vals)){let n=directChild(cf,k);if(!n){n=state.xmlDoc.createElement(k);cf.appendChild(n)}n.textContent=String(v)}
  } else return;
  setDirty(true); renderProperties(); drawViewport(); queueRecovery();
}

function openBottomDock(tab="output") {
  $("bottomDock").classList.remove("hidden");
  switchDockTab(tab);
}
function switchDockTab(tab) {
  document.querySelectorAll("[data-dock-tab]").forEach(b=>b.classList.toggle("active", b.dataset.dockTab===tab));
  $("dockOutput").classList.toggle("hidden", tab!=="output");
  $("dockCommand").classList.toggle("hidden", tab!=="command");
  $("dockAssets").classList.toggle("hidden", tab!=="assets");
  if (tab==="assets") renderAssetManager();
}
function renderAssetManager() {
  const host=$("assetManagerList"); host.innerHTML="";
  if (!state.xmlDoc) return;
  const props=[...state.xmlDoc.querySelectorAll("Content,ContentId")];
  const rows=[];
  for(const p of props){
    const url=directChild(p,"url");
    const value=(url?url.textContent:p.textContent).trim();
    if(!value) continue;
    const item=p.closest("Item");
    rows.push({name:item?getName(item):"(unknown)", prop:p.getAttribute("name")||p.tagName, value});
  }
  if(!rows.length){host.innerHTML='<div class="smallNote" style="padding:8px">No content asset references found.</div>';return;}
  for(const r of rows){
    const row=document.createElement("div"); row.className="assetRow";
    row.innerHTML=`<div><b>${r.name}</b><br>${r.prop}</div><div class="assetUri">${r.value}</div>`;
    host.appendChild(row);
  }
}
function findFirstByNameOrClass(term){
  term=term.toLowerCase();
  return state.xmlDoc ? [...state.xmlDoc.querySelectorAll("Item")].find(i=>getName(i).toLowerCase().includes(term)||(i.getAttribute("class")||"").toLowerCase().includes(term)) : null;
}
function runEditorCommand(raw){
  const cmd=raw.trim(); if(!cmd)return;
  addOutput(`> ${cmd}`);
  const [verb,...rest]=cmd.split(/\s+/); const arg=rest.join(" ");
  if(verb.toLowerCase()==="select"){const i=findFirstByNameOrClass(arg); if(i){selectItem(i);setStatus(`Selected ${getName(i)}`)}else addOutput(`No Instance matched: ${arg}`,"warn"); return;}
  if(verb.toLowerCase()==="find"){const i=findFirstByNameOrClass(arg); if(i){selectItem(i);setStatus(`Found ${getName(i)}`)}else addOutput(`No Instance matched: ${arg}`,"warn"); return;}
  if(verb.toLowerCase()==="insert"){insertObject(arg||"Part");return;}
  if(verb.toLowerCase()==="validate"){const p=validateXml(state.xmlDoc); addOutput(p.length?`Validator: ${p.length} warning(s)\n${p.join("\n")}`:"Validator: no structural warnings",p.length?"warn":"info");return;}
  addOutput("Unknown editor command. Try: select Workspace | insert Part | find Script | validate","warn");
}
function applySettings(){
  const n=Math.max(1,Math.min(60,Number($("recoveryInterval").value)||5));
  state.recoveryIntervalMinutes=n; state.autoRecoveryEnabled=$("autoRecoveryEnabled").checked; state.showToolLabels=$("showToolLabels").checked;
  document.body.classList.toggle("hideToolLabels",!state.showToolLabels);
  localStorage.setItem("StudioBridgeSettings",JSON.stringify({recoveryIntervalMinutes:n,autoRecoveryEnabled:state.autoRecoveryEnabled,showToolLabels:state.showToolLabels}));
  setStatus(`Settings applied • Auto-Recovery ${state.autoRecoveryEnabled?`every ${n} min`:"off"}`);
}
function loadSettings(){
  try{const s=JSON.parse(localStorage.getItem("StudioBridgeSettings")||"{}");
    if(s.recoveryIntervalMinutes)state.recoveryIntervalMinutes=s.recoveryIntervalMinutes;
    if(typeof s.autoRecoveryEnabled==="boolean")state.autoRecoveryEnabled=s.autoRecoveryEnabled;
    if(typeof s.showToolLabels==="boolean")state.showToolLabels=s.showToolLabels;
  }catch{}
  if($("recoveryInterval"))$("recoveryInterval").value=state.recoveryIntervalMinutes;
  if($("autoRecoveryEnabled"))$("autoRecoveryEnabled").checked=state.autoRecoveryEnabled;
  if($("showToolLabels"))$("showToolLabels").checked=state.showToolLabels;
  document.body.classList.toggle("hideToolLabels",!state.showToolLabels);
}

function showProjectInfo() {
  const items=state.xmlDoc?[...state.xmlDoc.querySelectorAll("Item")]:[];
  const problems=state.xmlDoc?validateXml(state.xmlDoc):["No project loaded."];
  $("projectInfo").innerHTML=`
    <p><b>File:</b> ${state.fileName}</p>
    <p><b>Instances:</b> ${items.length}</p>
    <p><b>Format target:</b> Roblox XML v4 (.rbxlx/.rbxmx)</p>
    <p><b>Compatibility validator:</b> ${problems.length ? problems.length+" warning(s)" : "No structural warnings found"}</p>
    ${problems.length?`<pre style="white-space:pre-wrap;font-size:11px">${problems.join("\n")}</pre>`:""}
  `;
  $("infoDialog").showModal();
}

/* Events */
$("fileMenuBtn").onclick=()=>$("fileMenu").classList.toggle("hidden");
document.addEventListener("click",e=>{if(!$("fileMenu").contains(e.target)&&e.target!==$("fileMenuBtn"))$("fileMenu").classList.add("hidden")});
$("fileMenu").addEventListener("click",e=>{
  const action=e.target.dataset.action; if(!action)return;
  $("fileMenu").classList.add("hidden");
  if(action==="new"){if(state.dirty&&!confirm("Discard unsaved changes?"))return;initializeNewProject()}
  if(action==="open")$("fileInput").click();
  if(action==="save")saveNow();
  if(action==="save-as")showSaveAs(false);
  if(action==="backup")showSaveAs(true);
  if(action==="open-recovery")showRecoveries();
  if(action==="project-info")showProjectInfo();
});
$("fileInput").addEventListener("change",e=>openFile(e.target.files[0]));
$("confirmSaveBtn").addEventListener("click",e=>{
  e.preventDefault();
  const fmt=$("saveFormat").value;
  let name=$("saveName").value.trim()||`Place.${fmt}`;
  name=name.replace(/\.(rbxlx|rbxmx|xml)$/i,"")+`.${fmt}`;
  $("saveDialog").close(); saveNow(name);
});
$("tabRow").addEventListener("click",e=>{
  const b=e.target.closest(".tab"); if(!b)return;
  state.activeTab=b.dataset.tab;
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));renderRibbon();
});
$("propertySearch").addEventListener("input",renderProperties);
$("explorerSearch").addEventListener("input",renderExplorer);
$("addObjectBtn").onclick=()=>$("insertDialog").showModal();
$("insertDialog").addEventListener("click",e=>{const b=e.target.closest("[data-insert]");if(b){insertObject(b.dataset.insert);$("insertDialog").close()}});
$("closeScriptBtn").onclick=()=>$("scriptPane").classList.add("hidden");
$("closeToolboxBtn").onclick=()=>$("toolboxPanel").classList.add("hidden");
$("windowMenuBtn").onclick=()=>$("windowMenu").classList.toggle("hidden");
$("windowMenu").addEventListener("click",e=>{
  const w=e.target.dataset.window;if(!w)return;$("windowMenu").classList.add("hidden");
  if(w==="toolbox")$("toolboxPanel").classList.remove("hidden");
  else if(w==="output")openBottomDock("output");
  else if(w==="command-bar")openBottomDock("command");
  else if(w==="asset-manager")openBottomDock("assets");
  else if(w==="settings")$("settingsDialog").showModal();
  else setStatus(`${w[0].toUpperCase()+w.slice(1)} is visible`);
});
$("closeBottomDock").onclick=()=>$("bottomDock").classList.add("hidden");
document.querySelectorAll("[data-dock-tab]").forEach(b=>b.onclick=()=>switchDockTab(b.dataset.dockTab));
$("runCommandBtn").onclick=()=>runEditorCommand($("commandInput").value);
$("refreshAssetsBtn").onclick=renderAssetManager;
$("applySettingsBtn").onclick=e=>{e.preventDefault();applySettings();$("settingsDialog").close();};
$("searchCreatorBtn").onclick=()=>{
  const q=encodeURIComponent($("creatorSearch").value.trim());
  window.open(`https://create.roblox.com/store/models?keyword=${q}`,"_blank");
};
$("insertAssetRefBtn").onclick=()=>{
  const id=$("assetId").value.trim(); const cls=$("assetType").value;
  if(!/^\d+$/.test(id)) return alert("Enter a numeric Roblox asset ID.");
  const item=createItem(cls);
  const props=ensureProperties(item);
  const uri=`rbxassetid://${id}`;
  if(cls==="MeshPart") props.appendChild(createContentIdProperty("MeshId",uri));
  if(cls==="Decal") props.appendChild(createContentIdProperty("Texture",uri));
  if(cls==="Sound") props.appendChild(createContentIdProperty("SoundId",uri));
  if(cls==="ImageLabel") props.appendChild(createContentIdProperty("Image",uri));
  const parent=bestParentForClass(cls); parent.appendChild(item);
  if(parent.tagName==="Item")state.expanded.add(parent.getAttribute("referent"));
  setDirty(true);renderExplorer();selectItem(item);queueRecovery();
};
$("playBtn").onclick=()=>alert("v0.2 does not emulate the Roblox engine. The planned Publish & Test flow will send an RBXLX place through Roblox Open Cloud, then open the real Roblox experience for testing.");
$("stopBtn").onclick=()=>setStatus("Preview stopped");
$("viewportCanvas").addEventListener("pointerdown",e=>{
  $("viewportCanvas").setPointerCapture(e.pointerId);
  state.pointer={x:e.clientX,y:e.clientY};
});
$("viewportCanvas").addEventListener("pointermove",e=>{
  if(!state.pointer)return;
  const dx=e.clientX-state.pointer.x,dy=e.clientY-state.pointer.y;
  state.pointer={x:e.clientX,y:e.clientY};
  if(["Move","Scale","Rotate"].includes(state.activeTool)&&state.selectedItem) transformSelected(dx,dy);
  else {state.viewport.panX+=dx;state.viewport.panY+=dy;drawViewport()}
});
$("viewportCanvas").addEventListener("pointerup",()=>state.pointer=null);
$("viewportCanvas").addEventListener("pointercancel",()=>state.pointer=null);
window.addEventListener("keydown",e=>{
  if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
  if(e.key==="1"){state.activeTool="Select";$("toolStatus").textContent="Select";renderRibbon();}
  if(e.key==="2"){state.activeTool="Move";$("toolStatus").textContent="Move";renderRibbon();}
  if(e.key==="3"){state.activeTool="Scale";$("toolStatus").textContent="Scale";renderRibbon();}
  if(e.key==="4"){state.activeTool="Rotate";$("toolStatus").textContent="Rotate";renderRibbon();}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();saveNow();}
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==="x"){e.preventDefault();$("explorerSearch").focus();}
});
window.addEventListener("resize",drawViewport);
window.addEventListener("beforeunload",e=>{if(state.dirty){e.preventDefault();e.returnValue=""}});

if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
loadSettings();
initializeNewProject();
addOutput("Studio Bridge Mobile v0.2 initialized");
console.info("[StudioBridge] v0.2 initialized");
})();