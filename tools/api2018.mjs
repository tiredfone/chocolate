import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dump = JSON.parse(fs.readFileSync(process.argv[2] || path.join(CH, 'tools', 'api-dump-0.349.json'), 'utf8'));

const PRIM = { float: 'number', double: 'number', int: 'int', int64: 'int', bool: 'bool', string: 'string' };
const DATA = {
  Vector3: 'V3', Vector2: 'V2', Vector2int16: 'V2', Color3: 'C3', BrickColor: 'BC', CFrame: 'CF', UDim2: 'UD2', UDim: 'UD',
  Content: 'Content', ProtectedString: 'string', NumberRange: 'NR', Rect: 'Rect', NumberSequence: 'NS', ColorSequence: 'CS',
};

const DEFAULTS = {
  'GuiObject.LayoutOrder': '0', 'GuiObject.Rotation': '0',
  'TextLabel.TextSize': '12', 'TextButton.TextSize': '12', 'TextBox.TextSize': '12',
  'TextLabel.LineHeight': '1', 'TextButton.LineHeight': '1', 'TextBox.LineHeight': '1',
  'TextBox.ClearTextOnFocus': 'true', 'TextBox.ShowNativeInput': 'true', 'TextBox.PlaceholderColor3': '0.7,0.7,0.7',
  'UIListLayout.FillDirection': '1', 'UIGridStyleLayout.FillDirection': '0', 'UIGridStyleLayout.HorizontalAlignment': '1', 'UIGridStyleLayout.VerticalAlignment': '1', 'UIGridStyleLayout.SortOrder': '0',
  'UIGridLayout.CellSize': '0,100,0,100', 'UIGridLayout.CellPadding': '0,5,0,5',
  'UIPageLayout.Animated': 'true', 'UIPageLayout.Circular': 'false', 'UIPageLayout.EasingStyle': '1', 'UIPageLayout.TweenTime': '1', 'UIPageLayout.GamepadInputEnabled': 'true', 'UIPageLayout.ScrollWheelInputEnabled': 'true', 'UIPageLayout.TouchInputEnabled': 'true',
  'UIScale.Scale': '1', 'UIAspectRatioConstraint.AspectRatio': '1',
  'UISizeConstraint.MaxSize': '1e9,1e9', 'UITextSizeConstraint.MaxTextSize': '100', 'UITextSizeConstraint.MinTextSize': '1',
  'ScrollingFrame.CanvasSize': '0,0,2,0', 'ScrollingFrame.ScrollBarThickness': '12', 'ScrollingFrame.ScrollingEnabled': 'true',
  'ScrollingFrame.TopImage': 'rbxasset://textures/ui/Scroll/scroll-top.png', 'ScrollingFrame.MidImage': 'rbxasset://textures/ui/Scroll/scroll-middle.png', 'ScrollingFrame.BottomImage': 'rbxasset://textures/ui/Scroll/scroll-bottom.png',
  'ScrollingFrame.ElasticBehavior': '0', 'ScrollingFrame.ScrollingDirection': '4',
  'ImageLabel.SliceScale': '1', 'ImageButton.SliceScale': '1', 'ImageLabel.TileSize': '1,0,1,0', 'ImageButton.TileSize': '1,0,1,0',
  'ScreenGui.ZIndexBehavior': '0', 'LayerCollector.Enabled': 'true', 'LayerCollector.ResetOnSpawn': 'true',
  'BillboardGui.MaxDistance': '1e9', 'BillboardGui.Enabled': 'true', 'SurfaceGui.Enabled': 'true', 'SurfaceGui.CanvasSize': '800,600', 'SurfaceGui.ToolPunchThroughDistance': '0',
  'BasePart.Color': '0.639,0.635,0.647', 'BasePart.CastShadow': 'true',
  'Humanoid.JumpPower': '50', 'Humanoid.NameDisplayDistance': '100', 'Humanoid.HealthDisplayDistance': '100', 'Humanoid.MaxSlopeAngle': '89', 'Humanoid.AutoJumpEnabled': 'true', 'Humanoid.UseJumpPower': 'true', 'Humanoid.AutomaticScalingEnabled': 'true',
  'StarterPlayer.CameraMaxZoomDistance': '400', 'StarterPlayer.CameraMinZoomDistance': '0.5', 'StarterPlayer.EnableMouseLockOption': 'true', 'StarterPlayer.AutoJumpEnabled': 'true',
  'StarterPlayer.CharacterWalkSpeed': '16', 'StarterPlayer.CharacterJumpPower': '50', 'StarterPlayer.CharacterMaxSlopeAngle': '89', 'StarterPlayer.CharacterUseJumpPower': 'true',
  'StarterPlayer.HealthDisplayDistance': '100', 'StarterPlayer.NameDisplayDistance': '100', 'StarterPlayer.LoadCharacterAppearance': 'true',
  'Player.CameraMaxZoomDistance': '400', 'Player.CameraMinZoomDistance': '0.5', 'Player.HealthDisplayDistance': '100', 'Player.NameDisplayDistance': '100', 'Player.CanLoadCharacterAppearance': 'true', 'Player.AutoJumpEnabled': 'true', 'Player.DevEnableMouseLock': 'true',
  'Camera.HeadScale': '1',
  'Lighting.OutdoorAmbient': '0.5,0.5,0.5', 'Lighting.ClockTime': '14',
  'Sound.PlaybackSpeed': '1', 'Sound.Volume': '0.5', 'Sound.MaxDistance': '10000', 'Sound.EmitterSize': '10',
  'UserGameSettings.MouseSensitivity': '1', 'UserGameSettings.MasterVolume': '1', 'UserGameSettings.SavedQualityLevel': '0', 'UserGameSettings.Fullscreen': 'false', 'UserGameSettings.CameraYInverted': 'false',
  'GuiService.AutoSelectGuiEnabled': 'true',
  'ParticleEmitter.Enabled': 'true', 'ParticleEmitter.Rate': '20', 'ParticleEmitter.Lifetime': '5,10', 'ParticleEmitter.Speed': '5,5', 'ParticleEmitter.Size': '0,1,0,1,1,0',
  'ParticleEmitter.Color': '0,1,1,1,0,1,1,1,1,0', 'ParticleEmitter.Transparency': '0,0,0,1,0,0', 'ParticleEmitter.Texture': 'rbxasset://textures/particles/sparkles_main.dds', 'ParticleEmitter.EmissionDirection': '1',
  'ParticleEmitter.LightInfluence': '0',
  'Beam.Enabled': 'true', 'Beam.Width0': '1', 'Beam.Width1': '1', 'Beam.Segments': '10', 'Beam.TextureLength': '1', 'Beam.TextureSpeed': '1', 'Beam.LightInfluence': '0',
  'Beam.Color': '0,1,1,1,0,1,1,1,1,0', 'Beam.Transparency': '0,0.5,0,1,0.5,0',
  'Trail.Enabled': 'true', 'Trail.Lifetime': '2', 'Trail.MinLength': '0.1', 'Trail.TextureLength': '1', 'Trail.Color': '0,1,1,1,0,1,1,1,1,0', 'Trail.Transparency': '0,0.5,0,1,0.5,0',
  'Constraint.Enabled': 'true', 'Constraint.Color': '23', 'WeldConstraint.Enabled': 'true',
  'SelectionBox.LineThickness': '0.15', 'SelectionBox.Color3': '0.051,0.412,0.675', 'SelectionBox.SurfaceColor3': '0.051,0.412,0.675', 'SelectionBox.SurfaceTransparency': '1',
  'BodyColors.HeadColor3': '0.961,0.804,0.188', 'BodyColors.LeftArmColor3': '0.961,0.804,0.188', 'BodyColors.RightArmColor3': '0.961,0.804,0.188',
  'BodyColors.TorsoColor3': '0.051,0.412,0.675', 'BodyColors.LeftLegColor3': '0.643,0.741,0.278', 'BodyColors.RightLegColor3': '0.643,0.741,0.278',
  'Attachment.Axis': '1,0,0', 'Attachment.SecondaryAxis': '0,1,0',
  'MeshPart.DoubleSided': 'false', 'InputObject.UserInputType': '21', 'InputObject.UserInputState': '4',
  'Players.MaxPlayers': '12', 'Players.CharacterAutoLoads': 'true', 'Players.BubbleChat': 'true', 'Players.ClassicChat': 'true',
  'Chat.LoadDefaultChat': 'true', 'Chat.BubbleChatEnabled': 'false',
  'Workspace.Gravity': '196.2', 'Workspace.FallenPartsDestroyHeight': '-500', 'Workspace.AllowThirdPartySales': 'false',
  'Animator.Archivable': 'true', 'Tool.CanBeDropped': 'true', 'Tool.RequiresHandle': 'true', 'Tool.Enabled': 'true',
  'Texture.StudsPerTileU': '2', 'Texture.StudsPerTileV': '2', 'Decal.Color3': '1,1,1',
  'HumanoidDescription.HeadScale': '1', 'HumanoidDescription.BodyTypeScale': '0.3', 'HumanoidDescription.DepthScale': '1', 'HumanoidDescription.HeightScale': '1', 'HumanoidDescription.WidthScale': '1',
  'Sky.SunAngularSize': '21', 'Sky.MoonAngularSize': '11', 'Sky.StarCount': '3000', 'Sky.CelestialBodiesShown': 'true',
  'Light.Brightness': '1', 'Light.Color': '1,1,1', 'Light.Enabled': 'true', 'PointLight.Range': '8', 'SpotLight.Range': '16', 'SpotLight.Angle': '90', 'SurfaceLight.Range': '16', 'SurfaceLight.Angle': '90',
  'BlurEffect.Size': '24', 'BloomEffect.Intensity': '0.4', 'BloomEffect.Size': '24', 'BloomEffect.Threshold': '0.95', 'SunRaysEffect.Intensity': '0.25', 'SunRaysEffect.Spread': '1', 'PostEffect.Enabled': 'true',
  'ColorCorrectionEffect.TintColor': '1,1,1',
  'Smoke.Color': '1,1,1', 'Smoke.Opacity': '0.5', 'Smoke.RiseVelocity': '1', 'Smoke.Size': '1', 'Smoke.Enabled': 'true',
  'Fire.Enabled': 'true', 'Fire.Size': '5', 'Fire.Heat': '9', 'Sparkles.Enabled': 'true',
  'ClickDetector.MaxActivationDistance': '32', 'Dialog.ConversationDistance': '25',
  'NumberValue.Value': '0', 'IntValue.Value': '0', 'BoolValue.Value': 'false',
};

const classes = new Map(dump.Classes.map((c) => [c.Name, c]));
const own = (c) => c.Members.filter((m) => m.MemberType === 'Property' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(m.Name) && !(m.Tags || []).includes('NotScriptable'));

const out = { classes: {}, enumProps: {}, events: {}, methods: {} };
for (const c of dump.Classes) {
  const tags = c.Tags || [];
  const props = [];
  const enumProps = {};
  for (const m of own(c)) {
    const vt = m.ValueType;
    let type;
    if (vt.Category === 'Primitive') type = PRIM[vt.Name];
    else if (vt.Category === 'DataType') type = DATA[vt.Name] || 'any';
    else if (vt.Category === 'Class') type = 'Ref';
    else if (vt.Category === 'Enum') {
      type = 'enum';
      enumProps[m.Name] = vt.Name;
    }
    if (!type) type = 'any';
    let d = DEFAULTS[`${c.Name}.${m.Name}`];
    if (d === undefined && type === 'enum') {
      const e = dump.Enums.find((x) => x.Name === vt.Name);
      const first = e && e.Items.reduce((a, b) => (b.Value < a.Value ? b : a), e.Items[0]);
      d = first ? String(first.Value) : undefined;
    }
    props.push(d === undefined ? `${m.Name}:${type}` : `${m.Name}:${type}=${d}`);
  }
  out.classes[c.Name] = {
    base: c.Superclass && c.Superclass !== '<<<ROOT>>>' ? c.Superclass : null,
    props: props.join('\u0001'),
    abstract: tags.includes('NotCreatable') && !tags.includes('Service'),
    service: tags.includes('Service'),
  };
  if (Object.keys(enumProps).length) out.enumProps[c.Name] = enumProps;
  const ev = c.Members.filter((m) => m.MemberType === 'Event').map((m) => m.Name);
  if (ev.length) out.events[c.Name] = ev;
  const fn = c.Members.filter((m) => m.MemberType === 'Function' || m.MemberType === 'Callback').map((m) => m.Name);
  if (fn.length) out.methods[c.Name] = fn;
}
const enums = {};
for (const e of dump.Enums) enums[e.Name] = Object.fromEntries(e.Items.map((i) => [i.Name, i.Value]));

const lines = [];
lines.push(`export const API2018_VERSION = ${JSON.stringify(String(dump.Version ?? '0.349'))};`);
lines.push(`export const ENUMS2018 = ${JSON.stringify(enums)};`);
const cls = {};
for (const [k, v] of Object.entries(out.classes)) cls[k] = { ...v, props: v.props.split('\u0001').filter(Boolean).join(' ') };
lines.push(`export const DEFS2018 = ${JSON.stringify(cls)};`);
lines.push(`export const ENUM_PROPS2018 = ${JSON.stringify(out.enumProps)};`);
lines.push(`export const EVENTS2018 = ${JSON.stringify(out.events)};`);
lines.push(`export const METHODS2018 = ${JSON.stringify(out.methods)};`);
fs.writeFileSync(path.join(CH, 'shared', 'classes2018.js'), lines.join('\n') + '\n');
console.log(`classes2018: ${Object.keys(cls).length} classes, ${Object.keys(enums).length} enums`);
