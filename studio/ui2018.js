import { publicPath } from '../client/assets.js';
import { UI, el } from './ui.js';

const ICON_DIR = 'RibbonBar/images/RibbonIcons/';
const SMALL = '16x16/images/Studio 2.0 icons/16x16/';

const MATERIALS = { Plastic: 256, Wood: 512, WoodPlanks: 528, Slate: 800, Concrete: 816, Metal: 1088, CorrodedMetal: 1040, DiamondPlate: 1056, Foil: 1072, Grass: 1280, Ice: 1536, Brick: 848, Sand: 1296, Fabric: 1312, Granite: 832, Marble: 784, Pebble: 864, Cobblestone: 880, SmoothPlastic: 272, Neon: 288 };

const ACTIONS = {
  fileNewAction: [null, 'New', SMALL + 'new_document_16_h.png'],
  fileOpenAction: ['open', 'Open from File...', SMALL + 'open_document_16_h.png'],
  filePublishedProjectsAction: [null, 'Open from Roblox...'],
  fileCloseAction: ['close', 'Close Place'],
  fileSaveAction: ['publish', 'Save', SMALL + 'save_16_h.png'],
  fileSaveAsAction: ['saveas', 'Save to File As...', SMALL + 'save_green_16_h.png'],
  publishToRobloxAction: ['publish', 'Publish to Roblox', SMALL + 'publish.png'],
  publishToRobloxAsAction: [null, 'Publish to Roblox As...', SMALL + 'publish_as.png'],
  publishSelectionToRobloxAction: ['savemodel', 'Save Selection to File...', SMALL + 'publish_selection.png'],
  downloadPlaceCopyAction: ['saveas', 'Download a Copy', SMALL + 'download_copy.png'],
  fileOpenRecentSavesAction: [null, 'Open Auto-Saves'],
  publishGameAction: [null, 'Publish as Game...'],
  exportPlaceAction: [null, 'Export Place...'],
  shortcutHelpAction: [null, 'Shortcuts', SMALL + 'help_shortcuts.png'],
  fastLogDumpAction: [null, 'Dump Logs'],
  aboutRobloxAction: ['about', 'About Roblox Studio'],
  onlineHelpAction: [null, 'Online Help', SMALL + 'help_online.png'],
  settingsAction: [null, 'Studio Settings...', SMALL + 'settings.png'],
  undoAction: ['undo', 'Undo', SMALL + 'undo_16_h.png'],
  redoAction: ['redo', 'Redo', SMALL + 'redo_16_h.png'],
  pasteAction: ['paste', 'Paste'],
  copyAction: ['copy', 'Copy'],
  cutAction: ['cut', 'Cut'],
  duplicateSelectionAction: ['duplicate', 'Duplicate'],
  advArrowToolAction: ['tool:drag', 'Select'],
  advTranslateAction: ['tool:move', 'Move'],
  resizeAction: ['tool:size', 'Scale'],
  advRotateAction: ['tool:rotate', 'Rotate'],
  Transform: [null, 'Transform'],
  toggleCollisionCheckAction: [null, 'Collisions'],
  viewToolboxAction: ['view:objects', 'Toolbox', ICON_DIR + 'View/Toolbox.png'],
  materialActionAsTool: [null, 'Material Action as Tool'],
  colorFillActionAsTool: [null, 'Color Action as Tool'],
  groupSelectionAction: ['group', 'Group', ICON_DIR + 'Home/Group.png'],
  ungroupSelectionAction: ['ungroup', 'Ungroup', ICON_DIR + 'Home/Ungroup.png'],
  anchorAction: ['anchor', 'Anchor'],
  lockAction: ['tool:lock', 'Lock Tool', SMALL + 'lock.png'],
  unlockAllAction: ['lockall', 'Unlock All', SMALL + 'lock_open.png'],
  simulationPlayAction: ['playsolo', 'Play', ICON_DIR + 'Test/Play-Solo.png'],
  simulationPlayFromCameraAction: ['playsolo', 'Play Here', ICON_DIR + 'Test/Play-Solo-Camera.png'],
  simulationRunAction: ['run', 'Run', ICON_DIR + 'Test/Run.png'],
  simulationResetAction: [null, 'Stop', ICON_DIR + 'Test/Stop.png'],
  simulationStopAction: [null, 'Pause', ICON_DIR + 'Test/Pause.png'],
  gameSettingsAction: ['gamesettings', 'Game Settings'],
  RobloxUIEditor: [null, 'UI Editor'],
  glueSurfaceAction: ['tool:surface1', 'Glue', SMALL + 'glue-surface.png'],
  smoothSurfaceAction: ['tool:surface0', 'Smooth', SMALL + 'smooth-surface.png'],
  smoothNoOutlinesAction: [null, 'Smooth, No Outline', SMALL + 'smooth-no-outlines-surface.png'],
  studsAction: ['tool:surface3', 'Studs', SMALL + 'connectors-surface.png'],
  inletAction: ['tool:surface4', 'Inlets', SMALL + 'indents-surface.png'],
  universalsAction: ['tool:surface5', 'Universal', SMALL + 'universals-surface.png'],
  weldSurfaceAction: ['tool:surface2', 'Add Weld', SMALL + 'weld-surface.png'],
  hingeAction: ['tool:surface6', 'Hinge', SMALL + 'hinge-surface.png'],
  motorRightAction: ['tool:surface7', 'Motor', SMALL + 'motor-surface.png'],
  unionSelectionAction: [null, 'Union', ICON_DIR + 'Home/Join.png'],
  negateSelectionAction: [null, 'Negate', ICON_DIR + 'Home/Negate.png'],
  separateSelectionAction: [null, 'Separate', ICON_DIR + 'Home/Separate.png'],
  createAttachmentAction: ['insert:cls:Attachment', 'Attachment'],
  drawConstraintDetailsVerb: [null, 'Show Details'],
  startLocationAction: ['insert:cls:SpawnLocation', 'Spawn', ICON_DIR + 'Insert/Spawn-Location.png'],
  actionInsertAdvancedObject: ['insert:object', 'Advanced Objects', ICON_DIR + 'Insert/Advanced-Objects.png'],
  insertModelAction: ['insert:model', 'Model', ICON_DIR + 'Insert/Model.png'],
  insertServiceAction: ['insert:service', 'Service', ICON_DIR + 'Insert/Service.png'],
  ScriptLargeAction: ['insert:cls:Script', 'Script', ICON_DIR + 'Insert/Script.png'],
  LocalScriptLargeAction: ['insert:cls:LocalScript', 'LocalScript', ICON_DIR + 'Insert/LocalScript.png'],
  ModuleScriptLargeAction: ['insert:cls:ModuleScript', 'ModuleScript', ICON_DIR + 'Insert/ModuleScript.png'],
  executeScriptAction: [null, 'Run Script', ICON_DIR + 'Test/Run-Script.png'],
  simulationDiabolicalModeAction: [null, 'Network Simulator', ICON_DIR + 'Test/Diabolical-Mode.png'],
  startServerAndPlayersAction: [null, 'Start', ICON_DIR + 'Test/Start-Server.png'],
  cleanupServersAndPlayersAction: [null, 'Cleanup', ICON_DIR + 'Test/Exit-Team-Test.png'],
  startTeamTestAction: [null, 'Team Test', ICON_DIR + 'Test/Team-Test.png'],
  cleanupTeamTestAction: [null, 'Exit Game', ICON_DIR + 'Test/Exit-Team-Test.png'],
  deviceEmulatorToggleAction: [null, 'Emulator', ICON_DIR + 'Test/emulator_32.png'],
  audioToggleAction: [null, 'Mute', ICON_DIR + 'Test/Audio-Enabled.png'],
  analyzePhysicsToggleAction: [null, 'Physics', ICON_DIR + 'Test/Physics-Test.png'],
  viewObjectExplorerAction: ['view:explorer', 'Explorer', ICON_DIR + 'View/Explorer.png'],
  viewPropertiesAction: ['view:properties', 'Properties', ICON_DIR + 'View/Properties.png'],
  actionStartPage: [null, 'Start Page', ICON_DIR + 'View/Start-Page.png'],
  gameExplorerAction: [null, 'Game Explorer', SMALL + 'ge_placefolder.png'],
  viewContextualHelpAction: [null, 'Context Help', ICON_DIR + 'View/Help-Wiki.png'],
  viewTutorialsAction: [null, 'Tutorials', ICON_DIR + 'View/Tutorials.png'],
  objectBrowserAction: ['objectbrowser', 'Object Browser', ICON_DIR + 'View/Object-Browser.png'],
  viewOutputWindowAction: ['view:output', 'Output', ICON_DIR + 'View/Output.png'],
  viewScriptAnalysisAction: [null, 'Script Analysis', SMALL + 'bug_error.png'],
  viewCommandBarAction: ['view:commandbar', 'Command Bar', SMALL + 'console_16.png'],
  breakpointsDockWidgetAction: [null, 'Breakpoints', ICON_DIR + 'View/Breakpoint.png'],
  callStackDockWidgetAction: [null, 'Call Stack', ICON_DIR + 'View/Call-Stack.png'],
  watchDockWidgetAction: [null, 'Watch', SMALL + 'watch.png'],
  viewDiagnosticsAction: [null, 'Diagnostics', ICON_DIR + 'View/Diagnostics.png'],
  viewTaskSchedulerAction: [null, 'Task Scheduler', ICON_DIR + 'View/Task-Scheduler.png'],
  viewScriptPerformanceAction: [null, 'Script Performance', ICON_DIR + 'View/Script-Performance.png'],
  viewFindResultsWindowAction: [null, 'Find Results', ICON_DIR + 'View/Find-Results.png'],
  viewTeamCreateAction: [null, 'Team Create', ICON_DIR + 'View/TeamCreate.png'],
  viewScriptRecoveryAction: [null, 'Script Recovery', SMALL + 'report.png'],
  toggleAxisWidgetAction: [null, 'Display Axis', ICON_DIR + 'View/Display-Axis.png'],
  actionFullScreen: ['fullscreen', 'Full Screen', ICON_DIR + 'View/Fullscreen.png'],
  screenShotAction: ['screenshot', 'Screen Shot', ICON_DIR + 'View/Screen-Capture.png'],
  toggleVideoRecordAction: [null, 'Video Record', ICON_DIR + 'View/Record-Video.png'],
  gridSizeToTwoAction: ['grid:2', '2 Studs', SMALL + 'grid.png'],
  gridSizeToFourAction: ['grid:4', '4 Studs', SMALL + 'grid.png'],
  gridSizeToSixteenAction: ['grid:16', '16 Studs', SMALL + 'grid_sixteen.png'],
  toggle3DGridAction: [null, 'Show Grid', ICON_DIR + 'View/Show-Grid.png'],
  testStatsAction: [null, 'Stats'], testRenderStatsAction: [null, 'Render'], testPhysicsStatsAction: [null, 'Physics'],
  testNetworkStatsAction: [null, 'Network'], testSummaryStatsAction: [null, 'Summary'], testClearStatsAction: [null, 'Clear'],
  managePluginsAction: [null, 'Manage Plugins', 'RibbonBar/images/Studio 2.0 icons/32x32/managePlugins.png'],
  openPluginsFolderAction: [null, 'Plugins Folder', 'RibbonBar/images/Studio 2.0 icons/32x32/open_plugins.png'],
  findAction: [null, 'Find', SMALL + 'find.png'], findNextAction: [null, 'Find Next', SMALL + 'find_next.png'],
  findPreviousAction: [null, 'Find Previous', SMALL + 'find_previous.png'], findInScriptsAction: [null, 'Find All'], goToLineAction: [null, 'Go To Line', SMALL + 'goToLine.png'],
  replaceAction: [null, 'Replace', ICON_DIR + 'Home/Replace.png'],
  selectAllAction: ['selectall', 'Select All', SMALL + 'select_all.png'], selectChildrenAction: ['selectchildren', 'Select Children', SMALL + 'select_children.png'],
  stepIntoAction: [null, 'Step Into', ICON_DIR + 'Test/Step-In.png'], stepOverAction: [null, 'Step Over', ICON_DIR + 'Test/Step-Over.png'],
  stepOutAction: [null, 'Step Out', ICON_DIR + 'Test/Step-Out.png'], addWatchAction: [null, 'Add Watch', ICON_DIR + 'Test/Add-Watch.png'],
  neverBreakOnScriptErrorsAction: [null, 'Never'], breakOnAllScriptErrorsAction: [null, 'On All Exceptions'], breakOnUnhandledScriptErrorsAction: [null, 'On Unhandled Exceptions'],
  goToScriptErrorAction: [null, 'Go To Error', SMALL + 'bug_go_to.png'], reloadScriptAction: [null, 'Reload Script', SMALL + 'reset.png'],
  commentSelectionAction: [null, 'Comment', SMALL + 'text_comment.png'], uncommentSelectionAction: [null, 'Uncomment', SMALL + 'text_uncomment.png'],
  toggleCommentAction: [null, 'Toggle Comment', SMALL + 'text_toggle_comment.png'], expandAllFoldsAction: [null, 'Expand All', SMALL + 'expand_all.png'],
  collapseAllFoldsAction: [null, 'Collapse All', SMALL + 'collapse_all.png'],
};

const GROUPS = {
  insertBasicObject: [
    ['insert:part:Block', 'Block', 'RibbonBar/images/Studio Ribbon Icons/block.png'],
    ['insert:part:Ball', 'Sphere', 'RibbonBar/images/Studio Ribbon Icons/sphere.png'],
    ['insert:cls:WedgePart', 'Wedge', 'RibbonBar/images/Studio Ribbon Icons/wedge.png'],
    ['insert:part:Cylinder', 'Cylinder', 'RibbonBar/images/Studio Ribbon Icons/cylinder.png'],
  ],
  effects: [
    ['insert:cls:Fire', 'Fire', SMALL + 'fire.png'],
    ['insert:cls:Smoke', 'Smoke', SMALL + 'smoke.png'],
    ['insert:cls:Sparkles', 'Sparkles', SMALL + 'sparkles.png'],
    ['insert:cls:PointLight', 'PointLight', SMALL + 'light.png'],
    ['insert:cls:Explosion', 'Explosion', SMALL + 'bomb.png'],
  ],
  jointCreationMode: [
    ['joints', 'Manual Joints', SMALL + 'connector-surface.png'],
  ],
};

function resUrl(p) {
  if (!p) return '';
  const clean = String(p).replace(/^:\/?/, '');
  return publicPath('/studio/ui2018/' + clean.split('/').map(encodeURIComponent).join('/'));
}

function spaced(name) {
  return String(name || '').replace(/Action$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

export class UI2018 extends UI {
  constructor(root, app) {
    root.classList.add('st-2018');
    super(root, app);
  }

  buildBars() {
    this.ribbonButtons = [];
    this.tabEls = new Map();
    const r = this.root;
    const top = el('div', 'st18-top', r);
    const qab = el('div', 'st18-qab', top);
    const logo = el('i', 'st18-logo', qab);
    logo.style.backgroundImage = `url("${resUrl('images/RobloxStudio.png')}")`;
    this.titleEl = el('div', 'st18-title', top);
    this.userEl = el('div', 'st18-user', top, this.app.cfg.userName || '');
    const tabrow = el('div', 'st18-tabrow', r);
    this.fileBtn = el('div', 'st18-file', tabrow, 'FILE');
    this.tabsBar = el('div', 'st18-tabs', tabrow);
    const right = el('div', 'st18-tabright', tabrow);
    this.minBtn = el('div', 'st18-min', right);
    this.minBtn.title = 'Minimize the Ribbon';
    this.minBtn.addEventListener('click', () => {
      r.classList.toggle('st18-ribbon-min');
      this.app.resized();
    });
    this.ribbon = el('div', 'st18-ribbon', r);
    this.ribbonBody = el('div', 'st18-ribbon-body', this.ribbon);
    this.statusBar = null;
    this.loadRibbon(qab);
  }

  buildBody() {
    super.buildBody();
    const cmd = el('div', 'st18-command', this.root);
    const input = el('input', null, cmd);
    input.type = 'text';
    input.placeholder = 'Run a command';
    input.disabled = true;
    input.title = 'This Studio does not run scripts';
    this.commandBar = cmd;
  }

  async loadRibbon(qab) {
    let data;
    try {
      const r = await fetch(publicPath('/studio/ui2018/ribbon.json'), { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      data = await r.json();
    } catch {
      data = null;
    }
    if (!data) {
      this.ribbonBody.textContent = 'The 2018 Studio ribbon is not installed. Run npm run studio2018-ui.';
      return;
    }
    const find = (tag) => data.kids.find((k) => k.tag === tag);
    const quick = find('QuickAccessBar');
    for (const a of quick ? quick.kids : []) {
      if (a.tag !== 'addaction' || a.attrs.visible === 'false') continue;
      const def = ACTIONS[a.attrs.name] || [null, spaced(a.attrs.name)];
      const b = el('div', 'st18-qbtn', qab);
      b.title = def[1];
      this.icon(b, def[2]);
      this.wire(b, def[0], a.attrs.name);
    }
    const sys = find('SystemButton');
    const popup = sys && sys.kids.find((k) => k.tag === 'SystemPopup');
    this.fileBtn.title = sys ? sys.attrs.tooltip || '' : '';
    this.fileBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.fileBtn.classList.contains('open')) return this.closePopups();
      this.closePopups();
      this.fileBtn.classList.add('open');
      const pop = this.openPopup(this.menuItems(popup ? popup.kids : []), this.fileBtn.getBoundingClientRect(), 0, () => this.fileBtn.classList.remove('open'));
      pop.classList.add('st18-filemenu');
    });
    const bar = find('RibbonBar');
    this.pages = bar ? bar.kids.filter((k) => k.tag === 'TabPage') : [];
    for (const page of this.pages) {
      const name = page.attrs.name;
      const t = el('div', 'st18-tab', this.tabsBar, name === 'scriptMenu' ? 'SCRIPT MENU' : name.toUpperCase());
      if (name === 'scriptMenu') t.classList.add('st18-contextual');
      t.addEventListener('click', () => this.showPage(name));
      this.tabEls.set(name, t);
    }
    this.setScriptMode(false);
    this.showPage('Home');
  }

  setScriptMode(on) {
    const t = this.tabEls && this.tabEls.get('scriptMenu');
    if (!t) return;
    t.hidden = !on;
    if (!on && this.page === 'scriptMenu') this.showPage('Home');
    if (on) this.showPage('scriptMenu');
  }

  showPage(name) {
    const page = this.pages.find((p) => p.attrs.name === name);
    if (!page) return;
    this.page = name;
    for (const [n, t] of this.tabEls) t.classList.toggle('active', n === name);
    this.root.classList.remove('st18-ribbon-min');
    this.ribbonButtons = this.ribbonButtons.filter((b) => b.persistent);
    this.ribbonBody.replaceChildren();
    for (const g of page.kids) if (g.tag === 'Group') this.group(g);
    this.refresh();
    this.app.resized();
  }

  icon(b, path) {
    const i = el('i', null, b);
    if (path) i.style.backgroundImage = `url("${resUrl(path)}")`;
    return i;
  }

  wire(b, cmd, name, persistent = true) {
    const rec = { el: b, cmd, persistent };
    this.ribbonButtons.push(rec);
    if (!cmd) b.title = (b.title || spaced(name)) + ' (not available in the browser Studio)';
    b.addEventListener('click', (e) => {
      if (b.classList.contains('disabled') || !cmd) return;
      e.stopPropagation();
      this.app.exec(cmd);
    });
    return rec;
  }

  flatten(kids) {
    const out = [];
    for (const k of kids) {
      if (k.tag === 'ActionGroup') out.push(...this.flatten(k.kids));
      else out.push(k);
    }
    return out;
  }

  actionDef(a) {
    const name = a.attrs.name;
    const def = ACTIONS[name] || [null, spaced(name)];
    const mat = /^ms_(\w+)$/.exec(name || '');
    if (mat && MATERIALS[mat[1]] != null) return [`material:${MATERIALS[mat[1]]}`, a.attrs.text || mat[1], `RibbonBar/images/Studio Ribbon Icons/${mat[1].charAt(0).toLowerCase() + mat[1].slice(1)}.png`];
    return [def[0], (a.attrs.text || def[1] || spaced(name)).trim(), a.attrs.icon || def[2]];
  }

  menuItems(kids) {
    const items = [];
    for (const k of this.flatten(kids)) {
      if (k.tag === 'addseparator') {
        if (items.length && items[items.length - 1]) items.push(null);
      } else if (k.tag === 'addaction') {
        if (k.attrs.fflag) continue;
        const [cmd, label] = this.actionDef(k);
        items.push([cmd || 'na:' + k.attrs.name, label]);
      } else if (k.tag === 'submenu') {
        items.push([k.attrs.name, this.menuItems(k.kids)]);
      }
    }
    while (items.length && !items[items.length - 1]) items.pop();
    return items;
  }

  groupMenu(name) {
    const list = GROUPS[name] || [];
    return list.map(([cmd, label]) => [cmd, label]);
  }

  bigButton(col, label, iconPath, cmd, name, menu) {
    const b = el('div', 'st18-big' + (menu ? ' st18-has-menu' : ''), col);
    b.title = label;
    this.icon(b, iconPath);
    el('span', null, b, label);
    if (menu) {
      const arrow = el('em', 'st18-arrow', b);
      const open = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closePopups();
        b.classList.add('open');
        this.openPopup(menu(), b.getBoundingClientRect(), 0, () => b.classList.remove('open'));
      };
      if (cmd) arrow.addEventListener('click', open);
      else b.addEventListener('click', open);
    }
    if (cmd || !menu) this.wire(b, cmd, name, false);
    else this.ribbonButtons.push({ el: b, cmd: 'menu', persistent: false });
    return b;
  }

  smallButton(col, label, iconPath, cmd, name, menu) {
    const b = el('div', 'st18-small' + (menu ? ' st18-has-menu' : ''), col);
    b.title = label;
    this.icon(b, iconPath);
    el('span', null, b, label);
    if (menu) {
      el('em', 'st18-arrow', b);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closePopups();
        this.openPopup(menu(), b.getBoundingClientRect(), 0);
      });
      this.ribbonButtons.push({ el: b, cmd: 'menu', persistent: false });
    } else this.wire(b, cmd, name, false);
    return b;
  }

  group(g) {
    const box = el('div', 'st18-group', this.ribbonBody);
    const items = el('div', 'st18-items', box);
    el('div', 'st18-caption', box, g.attrs.name);
    let column = null;
    const smallCol = () => {
      if (!column || column.children.length >= 3) column = el('div', 'st18-col', items);
      return column;
    };
    const big = () => {
      column = null;
      return el('div', 'st18-col st18-col-big', items);
    };
    for (const k of this.flatten(g.kids)) {
      const a = k.attrs;
      if (k.tag === 'addseparator') {
        column = null;
        if (a.visible !== 'false') el('div', 'st18-vsep', items);
        continue;
      }
      if (k.tag === 'groupoptionsmenu') continue;
      if (k.tag === 'addaction') {
        if (a.fflag) continue;
        const [cmd, label, iconPath] = this.actionDef(k);
        const large = a.style === 'textundericon' || (+a.width || 0) >= 32;
        if (large) this.bigButton(big(), label, iconPath, cmd, a.name, null);
        else this.smallButton(smallCol(), label, iconPath, cmd, a.name, null);
        continue;
      }
      if (k.tag === 'MenuPopupButton' || k.tag === 'MenuButton') {
        const inner = this.flatten(k.kids);
        const first = inner.find((x) => x.tag === 'addaction');
        const actionGroup = k.kids.find((x) => x.tag === 'ActionGroup' && !x.kids.length);
        const groupName = actionGroup ? actionGroup.attrs.name : k.attrs.name === 'actionParticleEffects' ? 'effects' : null;
        let menu;
        if (groupName && GROUPS[groupName]) menu = () => this.groupMenu(groupName);
        else menu = () => this.menuItems(k.kids);
        const label = (a.text || spaced(a.name)).trim();
        let iconPath = a.icon;
        let cmd = null;
        if (k.tag === 'MenuPopupButton' && first) {
          const d = this.actionDef(first);
          cmd = d[0];
          iconPath = iconPath || d[2];
        }
        if (k.attrs.name === 'placePartAction') cmd = 'insert:part:Block';
        const large = a.style === 'textundericon' || (+a.width || 0) >= 32 || k.tag === 'MenuPopupButton';
        if (large) this.bigButton(big(), label, iconPath, cmd, a.name, menu);
        else this.smallButton(smallCol(), label, iconPath, cmd, a.name, menu);
        continue;
      }
      if (k.tag === 'ColorPicker') {
        const b = this.bigButton(big(), (a.text || 'Color').trim(), a.icon || ICON_DIR + 'Home/Color.png', 'color', a.name, null);
        b.classList.add('st18-color');
        continue;
      }
      if (k.tag === 'addcheckbox') {
        const row = el('label', 'st18-check', smallCol());
        const box = el('input', null, row);
        box.type = 'checkbox';
        el('span', null, row, (a.text || spaced(a.name)).trim());
        const cmd = a.name === 'disableDragGridAction' ? 'snap:move' : a.name === 'disableRotateGridAction' ? 'snap:rotate' : null;
        box.disabled = !cmd;
        box.addEventListener('change', () => cmd && this.app.exec(cmd));
        this.ribbonButtons.push({ el: row, cmd, check: box, persistent: false });
        continue;
      }
      if (k.tag === 'addspinbox') {
        const row = el('label', 'st18-spin', smallCol());
        const input = el('input', null, row);
        input.type = 'number';
        input.min = '0';
        input.step = a.name === 'setRotateIncrementAction' ? '1' : '0.1';
        const unit = el('span', null, row, a.name === 'setRotateIncrementAction' ? '°' : 'studs');
        unit.className = 'st18-unit';
        const kind = a.name === 'setRotateIncrementAction' ? 'rotgrid' : 'grid';
        input.addEventListener('change', () => {
          const v = Math.max(0, +input.value || 0);
          this.app.exec(`${kind}:${v}`);
        });
        this.ribbonButtons.push({ el: row, cmd: 'spin:' + kind, spin: input, persistent: false });
        continue;
      }
      if (k.tag === 'addcombobox') {
        const s = el('select', 'st18-combo', smallCol());
        for (const it of k.kids.filter((x) => x.tag === 'comboboxitem')) el('option', null, s, it.attrs.text || '');
        s.disabled = true;
        continue;
      }
    }
  }

  refresh() {
    super.refresh();
    for (const b of this.ribbonButtons || []) {
      if (b.cmd === 'menu') continue;
      if (b.check) {
        b.check.checked = !!this.app.checked(b.cmd);
        continue;
      }
      if (b.spin) {
        const v = b.cmd === 'spin:grid' ? this.app.grid : this.app.rotateGrid;
        if (document.activeElement !== b.spin) b.spin.value = String(v ?? 0);
        continue;
      }
      const on = !!b.cmd && this.app.enabled(b.cmd);
      b.el.classList.toggle('disabled', !on);
      b.el.classList.toggle('active', !!b.cmd && !!this.app.checked(b.cmd));
    }
  }

  setTitle(t) {
    this.titleEl.textContent = t;
    document.title = t;
  }
}
