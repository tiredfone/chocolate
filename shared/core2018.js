const ROOT = 'CoreScriptsRoot/';

function created(dm, inst) {
  for (const o of dm.observers) if (o.created) o.created(inst);
}

function make(dm, cls, name, parent, source) {
  const s = dm.create(cls, null);
  s.props.set('Name', name);
  if (source != null) s.props.set('Source', source);
  created(dm, s);
  if (parent) dm.setParent(s, parent);
  return s;
}

function treeOf(files, prefix) {
  const root = { dirs: new Map(), files: new Map() };
  for (const [path, src] of Object.entries(files)) {
    if (!path.startsWith(prefix)) continue;
    const parts = path.slice(prefix.length).split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: new Map() });
      node = node.dirs.get(parts[i]);
    }
    node.files.set(parts[parts.length - 1], src);
  }
  return root;
}

function scriptClass(file, top) {
  if (file.endsWith('.client.lua')) return ['LocalScript', file.slice(0, -11)];
  if (file.endsWith('.server.lua')) return ['Script', file.slice(0, -11)];
  return [top ? 'LocalScript' : 'ModuleScript', file.slice(0, -4)];
}

function buildInto(dm, node, parent, top) {
  const made = new Map();
  for (const [file, src] of node.files) {
    if (!file.endsWith('.lua')) continue;
    const [cls, name] = scriptClass(file, top);
    made.set(name, make(dm, cls, name, null, src));
  }
  for (const [dir, sub] of node.dirs) {
    let holder = made.get(dir);
    if (!holder) {
      holder = make(dm, 'Folder', dir, null, null);
      made.set(dir, holder);
    }
    buildInto(dm, sub, holder, false);
  }
  for (const inst of made.values()) dm.setParent(inst, parent);
  return made;
}

export class Core2018 {
  constructor(dm, files) {
    this.dm = dm;
    this.files = files || {};
  }

  source(path) {
    return this.files[path] ?? null;
  }

  buildModules(robloxGui) {
    const dm = this.dm;
    const modules = make(dm, 'Folder', 'Modules', null, null);
    buildInto(dm, treeOf(this.files, ROOT + 'Modules/'), modules, false);
    dm.setParent(modules, robloxGui);
    return modules;
  }

  coreScript(name, parent) {
    const src = this.source(ROOT + name + '.lua');
    if (src == null) return null;
    return make(this.dm, 'CoreScript', name, parent, src);
  }

  starterScript(parent, server) {
    const src = this.source(ROOT + (server ? 'ServerStarterScript.lua' : 'StarterScript.lua'));
    if (src == null) return null;
    return make(this.dm, 'CoreScript', server ? 'ServerStarterScript' : 'StarterScript', parent, src);
  }

  installPlayerScripts(starterPlayer) {
    const dm = this.dm;
    let sps = starterPlayer.findChildOfClass('StarterPlayerScripts');
    if (!sps) sps = make(dm, 'StarterPlayerScripts', 'StarterPlayerScripts', starterPlayer, null);
    let scs = starterPlayer.findChildOfClass('StarterCharacterScripts');
    if (!scs) scs = make(dm, 'StarterCharacterScripts', 'StarterCharacterScripts', starterPlayer, null);
    const ps = treeOf(this.files, 'PlayerScripts/StarterPlayerScripts/');
    for (const name of ['CameraScript', 'ControlScript']) {
      if (sps.findChild(name)) continue;
      const one = { dirs: new Map(), files: new Map() };
      if (ps.files.has(name + '.lua')) one.files.set(name + '.lua', ps.files.get(name + '.lua'));
      if (ps.dirs.has(name)) one.dirs.set(name, ps.dirs.get(name));
      buildInto(dm, one, sps, true);
    }
    const cs = treeOf(this.files, 'PlayerScripts/StarterCharacterScripts/');
    if (!scs.findChild('Sound')) buildInto(dm, cs, scs, true);
    return { sps, scs };
  }
}
