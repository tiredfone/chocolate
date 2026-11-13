export const SERVICES_2012 = ['Workspace', 'Lighting', 'StarterGui', 'StarterPack'];
export const SERVICES_2018 = ['Workspace', 'Players', 'Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'Teams', 'SoundService', 'Chat', 'LocalizationService', 'TestService'];
const STARTER_PLAYER = ['StarterPlayerScripts', 'StarterCharacterScripts'];

export function defaultServices(dm, era) {
  const list = era === 2018 ? SERVICES_2018 : SERVICES_2012;
  for (const s of list) {
    const svc = dm.service(s);
    if (svc && era === 2018) svc.studioHidden = false;
  }
  if (era !== 2018) return;
  const sp = dm.services.get('StarterPlayer');
  if (!sp) return;
  for (const cls of STARTER_PLAYER) {
    if (sp.findChildOfClass(cls)) continue;
    const c = dm.create(cls, null);
    c.props.set('Name', cls);
    dm.setParent(c, sp);
  }
}
