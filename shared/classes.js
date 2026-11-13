import { DEFS2018, ENUMS2018, ENUM_PROPS2018 } from './classes2018.js';

export const ENUMS = {
  PartType: { Ball: 0, Block: 1, Cylinder: 2 },
  SurfaceType: { Smooth: 0, Glue: 1, Weld: 2, Studs: 3, Inlet: 4, Universal: 5, Hinge: 6, Motor: 7, SteppingMotor: 8, Unjoinable: 9, SmoothNoOutlines: 10 },
  InputType: { NoInput: 0, LeftTread: 1, RightTread: 2, Steer: 3, Throtle: 4, UpDown: 6, Action1: 7, Action2: 8, Action3: 9, Action4: 10, Action5: 11, Sin: 12, Constant: 13 },
  NormalId: { Right: 0, Top: 1, Back: 2, Left: 3, Bottom: 4, Front: 5 },
  Material: {
    Plastic: 256, SmoothPlastic: 272, Neon: 288, Wood: 512, WoodPlanks: 528, Marble: 784, Slate: 800, Concrete: 816,
    Granite: 832, Brick: 848, Pebble: 864, Cobblestone: 880, CorrodedMetal: 1040, DiamondPlate: 1056, Foil: 1072,
    Metal: 1088, Grass: 1280, Sand: 1296, Fabric: 1312, Ice: 1536, Glass: 1568,
  },
  FormFactor: { Symmetric: 0, Brick: 1, Plate: 2, Custom: 3 },
  MeshType: { Head: 0, Torso: 1, Wedge: 2, Sphere: 3, Cylinder: 4, FileMesh: 5, Brick: 6, Prism: 7, Pyramid: 8, ParallelRamp: 9, RightAngleRamp: 10, CornerWedge: 11 },
  Font: { Legacy: 0, Arial: 1, ArialBold: 2, SourceSans: 3, SourceSansBold: 4, SourceSansLight: 5, SourceSansItalic: 6 },
  FontSize: { Size8: 0, Size9: 1, Size10: 2, Size11: 3, Size12: 4, Size14: 5, Size18: 6, Size24: 7, Size36: 8, Size48: 9, Size28: 10, Size32: 11, Size42: 12, Size60: 13, Size96: 14 },
  TextXAlignment: { Left: 0, Right: 1, Center: 2 },
  TextYAlignment: { Top: 0, Center: 1, Bottom: 2 },
  SizeConstraint: { RelativeXY: 0, RelativeXX: 1, RelativeYY: 2 },
  FrameStyle: { Custom: 0, ChatBlue: 1, RobloxSquare: 2, RobloxRound: 3, ChatGreen: 4, ChatRed: 5, DropShadow: 6 },
  ButtonStyle: { Custom: 0, RobloxButtonDefault: 1, RobloxButton: 2 },
  CameraType: { Fixed: 0, Attach: 1, Watch: 2, Track: 3, Follow: 4, Custom: 5, Scriptable: 6 },
  BinType: { Script: 0, GameTool: 1, Grab: 2, Clone: 3, Hammer: 4 },
  Style: { AlternatingSupports: 0, BridgeStyleSupports: 1, NoSupports: 2 },
  ScaleType: { Stretch: 0, Slice: 1 },
  BodyPart: { Head: 0, Torso: 1, LeftArm: 2, RightArm: 3, LeftLeg: 4, RightLeg: 5 },
  Limb: { Head: 0, Torso: 1, LeftArm: 2, RightArm: 3, LeftLeg: 4, RightLeg: 5, Unknown: 6 },
  DialogPurpose: { Quest: 0, Help: 1, Shop: 2 },
  DialogTone: { Neutral: 0, Friendly: 1, Enemy: 2 },
  ExplosionType: { NoCraters: 0, Craters: 1, CratersAndDebris: 2 },
  HumanoidStateType: {
    FallingDown: 0, Running: 8, RunningNoPhysics: 10, Climbing: 12, StrafingNoPhysics: 11, Ragdoll: 1, GettingUp: 2,
    Jumping: 3, Landed: 7, Flying: 6, Freefall: 5, Seated: 13, PlatformStanding: 14, Dead: 15, Swimming: 4, Physics: 16, None: 18,
  },
  KeyCode: {},
  UserInputType: { MouseButton1: 0, MouseButton2: 1, MouseButton3: 2, MouseWheel: 3, MouseMovement: 4, Touch: 7, Keyboard: 8, Focus: 9, None: 18 },
  UserInputState: { Begin: 0, Change: 1, End: 2, Cancel: 3, None: 4 },
  Controller: { None: 0, Player: 7, KeyboardRight: 1, KeyboardLeft: 2, Joypad1: 3, Joypad2: 4, Chase: 5, Flee: 6 },
  LeftRight: { Left: 0, Center: 1, Right: 2 },
  ChatMode: { Menu: 0, TextAndMenu: 1 },
  MembershipType: { None: 0, BuildersClub: 1, TurboBuildersClub: 2, OutrageousBuildersClub: 3 },
  ChatColor: { Blue: 0, Green: 1, Red: 2, White: 3 },
  ThrottleType: { None: 0, Default: 1, Disabled: 2 },
  SoundType: { NoSound: 0, Boing: 1, Bomb: 2, Break: 3, Click: 4, Clock: 5, Slingshot: 6, Page: 7, Ping: 8, Snap: 9, Splat: 10, Step: 11, StepOn: 12, Swoosh: 13, Victory: 14 },
  Axis: { X: 0, Y: 1, Z: 2 },
  ActuatorType: { None: 0, Motor: 1, Servo: 2 },
  PlayerChatType: { All: 0, Team: 1, Whisper: 2 },
  SpecialKey: { Insert: 0, Home: 1, End: 2, PageUp: 3, PageDown: 4, ChatHotkey: 5 },
  ControlMode: { Classic: 0, 'Mouse Lock Switch': 1, MouseLockSwitch: 1 },
  SavedQualitySetting: { Automatic: 0, QualityLevel1: 1, QualityLevel2: 2, QualityLevel3: 3, QualityLevel4: 4, QualityLevel5: 5, QualityLevel6: 6, QualityLevel7: 7, QualityLevel8: 8, QualityLevel9: 9, QualityLevel10: 10 },
  QualityLevel: Object.fromEntries([['Automatic', 0], ...Array.from({ length: 21 }, (_, i) => ['Level' + String(i + 1).padStart(2, '0'), i + 1])]),
  FriendStatus: { Unknown: 0, NotFriend: 1, Friend: 2, FriendRequestSent: 3, FriendRequestReceived: 4 },
  FriendRequestEvent: { Issue: 0, Revoke: 1, Accept: 2, Deny: 3 },
  CoreGuiType: { PlayerList: 0, Health: 1, Backpack: 2, Chat: 3, All: 4 },
  MessageType: { MessageOutput: 0, MessageInfo: 1, MessageWarning: 2, MessageError: 3 },
  ChatStyle: { Classic: 0, Bubble: 1, ClassicAndBubble: 2 },
  CenterDialogType: { UnsolicitedDialog: 1, PlayerInitiatedDialog: 2, ModalDialog: 3, QuitDialog: 4 },
  VideoQualitySettings: { LowResolution: 0, MediumResolution: 1, HighResolution: 2 },
  UploadSetting: { Never: 0, 'Ask me first': 1, Ask: 1, Always: 2 },
  CameraMode: { Classic: 0, LockFirstPerson: 1 },
  EasingDirection: { In: 0, Out: 1, InOut: 2 },
  TweenStatus: { Canceled: 0, Completed: 1 },
  EasingStyle: { Linear: 0, Sine: 1, Back: 2, Quad: 3, Quart: 4, Quint: 5, Bounce: 6, Elastic: 7 },
};

const ENUM_PROPS = {
  SavedQualityLevel: 'SavedQualitySetting', ControlMode: 'ControlMode', QualityLevel: 'QualityLevel', VideoUploadPromptBehavior: 'UploadSetting', CameraMode: 'CameraMode',
  shape: 'PartType', Shape: 'PartType', Material: 'Material', FormFactor: 'FormFactor', formFactorRaw: 'FormFactor', formFactor: 'FormFactor',
  TopSurface: 'SurfaceType', BottomSurface: 'SurfaceType', LeftSurface: 'SurfaceType', RightSurface: 'SurfaceType', FrontSurface: 'SurfaceType', BackSurface: 'SurfaceType',
  TopSurfaceInput: 'InputType', BottomSurfaceInput: 'InputType', LeftSurfaceInput: 'InputType', RightSurfaceInput: 'InputType', FrontSurfaceInput: 'InputType', BackSurfaceInput: 'InputType',
  MeshType: 'MeshType', Font: 'Font', FontSize: 'FontSize', TextXAlignment: 'TextXAlignment', TextYAlignment: 'TextYAlignment',
  SizeConstraint: 'SizeConstraint', CameraType: 'CameraType', BinType: 'BinType', ScaleType: 'ScaleType', BodyPart: 'BodyPart',
  UserInputType: 'UserInputType', UserInputState: 'UserInputState', MembershipType: 'MembershipType', ChatMode: 'ChatMode',
  Purpose: 'DialogPurpose', Tone: 'DialogTone', ExplosionType: 'ExplosionType', Controller: 'Controller', Face: 'NormalId',
};

const GUI_OBJECT = 'Active:bool=false BackgroundColor3:C3=0.639,0.635,0.647 BackgroundTransparency:number=0 BorderColor3:C3=0.106,0.165,0.208 BorderSizePixel:int=1 ClipsDescendants:bool=false Draggable:bool=false Position:UD2 Size:UD2 SizeConstraint:enum=0 Visible:bool=true ZIndex:int=1';
const TEXT = 'Font:enum=0 FontSize:enum=4 Text:string TextColor3:C3=0.106,0.165,0.208 TextStrokeColor3:C3=0,0,0 TextStrokeTransparency:number=1 TextTransparency:number=0 TextWrap:bool=false TextWrapped:bool=false TextScaled:bool=false TextXAlignment:enum=2 TextYAlignment:enum=1 TextBounds:V2';
const IMAGE = 'Image:Content ImageColor3:C3=1,1,1 ImageTransparency:number=0 ImageRectOffset:V2 ImageRectSize:V2 ScaleType:enum=0';
const SURFACES = ['Top', 'Bottom', 'Left', 'Right', 'Front', 'Back'];
const PART = [
  'Anchored:bool=false CanCollide:bool=true Locked:bool=false Transparency:number=0 Reflectance:number=0 Elasticity:number=0.5 Friction:number=0.3',
  'BrickColor:BC=194 CFrame:CF Size:V3=4,1.2,2 Velocity:V3 RotVelocity:V3 Material:enum=256 FormFactor:enum=1 Archivable:bool=true',
  SURFACES.map((s) => `${s}Surface:enum=0 ${s}SurfaceInput:enum=0 ${s}ParamA:number=-0.5 ${s}ParamB:number=0.5`).join(' '),
].join(' ');
const JOINT = 'C0:CF C1:CF Part0:Ref Part1:Ref';
const VALUE = (t, d = '') => `Value:${t}${d}`;

const DEFS = {
  Instance: { props: 'Name:string Archivable:bool=true RobloxLocked:bool=false', abstract: true },
  DataModel: { base: 'Instance', props: 'PlaceId:int=0 JobId:string CreatorId:int=0 GameId:int=0' },
  ServiceProvider: { base: 'Instance', abstract: true },
  Workspace: { base: 'Model', service: true, props: 'CurrentCamera:Ref DistributedGameTime:number=0 Gravity:number=196.2 FallenPartsDestroyHeight:number=-500 FilteringEnabled:bool=false CollisionGroups:string=' },
  Players: { base: 'Instance', service: true, props: 'CharacterAutoLoads:bool=true MaxPlayers:int=12 LocalPlayer:Ref NumPlayers:int=0 BubbleChat:bool=true ClassicChat:bool=true' },
  Lighting: {
    base: 'Instance', service: true,
    props: 'Ambient:C3=0.5,0.5,0.5 Brightness:number=1 ColorShift_Bottom:C3=0,0,0 ColorShift_Top:C3=0,0,0 FogColor:C3=0.753,0.753,0.753 FogEnd:number=100000 FogStart:number=0 GeographicLatitude:number=41.733 ShadowColor:C3=0.702,0.702,0.722 TimeOfDay:string=14:00:00 OutdoorAmbient:C3=0.5,0.5,0.5 GlobalShadows:bool=false',
  },
  StarterGui: { base: 'Instance', service: true, props: 'ResetPlayerGuiOnSpawn:bool=true ShowDevelopmentGui:bool=true' },
  StarterPack: { base: 'Instance', service: true },
  StarterPlayer: { base: 'Instance', service: true },
  StarterPlayerScripts: { base: 'Instance' },
  StarterCharacterScripts: { base: 'Instance' },
  Teams: { base: 'Instance', service: true },
  SoundService: { base: 'Instance', service: true, props: 'AmbientReverb:enum=0 DistanceFactor:number=10 DopplerScale:number=1 RolloffScale:number=1' },
  Debris: { base: 'Instance', service: true, props: 'MaxItems:int=1000' },
  ReplicatedStorage: { base: 'Instance', service: true },
  ReplicatedFirst: { base: 'Instance', service: true },
  ServerStorage: { base: 'Instance', service: true },
  ServerScriptService: { base: 'Instance', service: true, props: 'LoadStringEnabled:bool=false' },
  InsertService: { base: 'Instance', service: true },
  RunService: { base: 'Instance', service: true },
  BadgeService: { base: 'Instance', service: true },
  ContentProvider: { base: 'Instance', service: true, props: 'BaseUrl:string RequestQueueSize:int=0' },
  Chat: { base: 'Instance', service: true },
  CollectionService: { base: 'Instance', service: true },
  LocalBackpack: { base: 'Instance', service: true },
  PhysicsService: { base: 'Instance', service: true },
  TeleportService: { base: 'Instance', service: true },
  MarketplaceService: { base: 'Instance', service: true },
  GamePassService: { base: 'Instance', service: true },
  PointsService: { base: 'Instance', service: true },
  HttpService: { base: 'Instance', service: true, props: 'HttpEnabled:bool=false' },
  GuiService: { base: 'Instance', service: true, props: 'IsModalDialog:bool=false IsWindows:bool=true UseLuaChat:bool=true ShowLegacyPlayerList:bool=false MenuIsOpen:bool=false' },
  CoreGui: { base: 'Instance', service: true, props: 'Version:int=7' },
  LogService: { base: 'Instance', service: true },
  UserSettings: { base: 'Instance', abstract: true },
  UserGameSettings: { base: 'Instance', abstract: true, props: 'SavedQualityLevel:enum=0 ControlMode:enum=0 VideoUploadPromptBehavior:enum=1 MouseSensitivity:number=1 CameraMode:enum=0' },
  GlobalSettings: { base: 'Instance', abstract: true },
  RenderSettings: { base: 'Instance', abstract: true, props: 'QualityLevel:enum=0 EnableFRM:bool=true AutoFRMLevel:int=0' },
  UserInputService: { base: 'Instance', service: true, props: 'TouchEnabled:bool=false KeyboardEnabled:bool=true MouseEnabled:bool=true AccelerometerEnabled:bool=false GyroscopeEnabled:bool=false GamepadEnabled:bool=false ModalEnabled:bool=false' },
  InputObject: { base: 'Instance', nocreate: true, props: 'UserInputType:enum=21 UserInputState:enum=4 Position:V3 Delta:V3' },
  ContextActionService: { base: 'Instance', service: true },
  TweenService: { base: 'Instance', service: true },
  JointsService: { base: 'Instance', service: true },
  TestService: { base: 'Instance', service: true },
  ChangeHistoryService: { base: 'Instance', service: true },
  PluginToolbar: { base: 'Instance' },
  PluginToolbarButton: { base: 'Instance', props: 'Enabled:bool=true ClickableWhenViewportHidden:bool=false Icon:Content' },
  Selection: { base: 'Instance', service: true },
  ScriptContext: { base: 'Instance', service: true },
  NetworkServer: { base: 'Instance', service: true },
  NetworkClient: { base: 'Instance', service: true },
  Visit: { base: 'Instance', service: true },
  LogService: { base: 'Instance', service: true },
  MessagingService: { base: 'Instance', service: true },
  FriendService: { base: 'Instance', service: true },
  Geometry: { base: 'Instance', service: true },
  LocalizationService: { base: 'Instance', service: true },

  Model: { base: 'PVInstance', props: 'PrimaryPart:Ref ModelInPrimary:CF Controller:enum=0' },
  PVInstance: { base: 'Instance', abstract: true },
  Folder: { base: 'Instance' },
  Configuration: { base: 'Instance' },
  Hat: { base: 'Accoutrement' },
  Accessory: { base: 'Accoutrement' },
  Accoutrement: { base: 'Instance', props: 'AttachmentPoint:CF' },
  Tool: { base: 'BackpackItem', props: 'Enabled:bool=true Grip:CF=0,-1,0 CanBeDropped:bool=true RequiresHandle:bool=true ManualActivationOnly:bool=false' },
  HopperBin: { base: 'BackpackItem', props: 'Active:bool=false BinType:enum=0' },
  BackpackItem: { base: 'Instance', abstract: true, props: 'TextureId:Content ToolTip:string' },
  Backpack: { base: 'Instance' },
  PlayerGui: { base: 'Instance' },
  PlayerScripts: { base: 'Instance' },
  Player: {
    base: 'Instance',
    props: 'PersonalServerRank:int=0 userId:int=0 UserId:int=0 Character:Ref CharacterAppearance:string Neutral:bool=true TeamColor:BC=194 MembershipType:enum=0 ChatMode:enum=1 AccountAge:int=0 DisplayName:string CameraMode:enum=0 DataReady:bool=true DataComplexity:int=0 DataComplexityLimit:int=45000',
    aliases: { UserId: 'userId' },
  },
  Team: { base: 'Instance', props: 'TeamColor:BC=194 AutoAssignable:bool=true AutoColorCharacters:bool=true Score:int=0' },
  Camera: { base: 'Instance', props: 'CFrame:CF=0,20,20 Focus:CF CameraSubject:Ref CameraType:enum=0 FieldOfView:number=70', aliases: { CoordinateFrame: 'CFrame' } },
  Terrain: { base: 'BasePart' },

  BasePart: { base: 'PVInstance', abstract: true, props: PART },
  FormFactorPart: { base: 'BasePart', abstract: true },
  Part: { base: 'FormFactorPart', props: 'Shape:enum=1' },
  WedgePart: { base: 'FormFactorPart' },
  CornerWedgePart: { base: 'BasePart' },
  TrussPart: { base: 'BasePart', props: 'Style:enum=0' },
  Seat: { base: 'Part', props: 'Disabled:bool=false Occupant:Ref' },
  VehicleSeat: { base: 'BasePart', props: 'Disabled:bool=false HeadsUpDisplay:bool=true MaxSpeed:number=25 Steer:int=0 Throttle:int=0 Torque:number=10 TurnSpeed:number=1 Occupant:Ref' },
  SkateboardPlatform: { base: 'Part', props: 'Steer:int=0 Throttle:int=0 StickyWheels:bool=true' },
  SpawnLocation: { base: 'Part', props: 'AllowTeamChangeOnTouch:bool=false Duration:int=10 Enabled:bool=true Neutral:bool=true TeamColor:BC=194' },
  FlagStand: { base: 'Part', props: 'TeamColor:BC=194' },
  Platform: { base: 'Part' },

  DataModelMesh: { base: 'Instance', abstract: true, props: 'Offset:V3 Scale:V3=1,1,1 VertexColor:V3=1,1,1' },
  SpecialMesh: { base: 'FileMesh', props: 'MeshType:enum=6' },
  FileMesh: { base: 'DataModelMesh', props: 'MeshId:Content TextureId:Content' },
  BlockMesh: { base: 'DataModelMesh', props: 'Bevel:number=0' },
  CylinderMesh: { base: 'DataModelMesh', props: 'Bevel:number=0' },
  CharacterMesh: { base: 'Instance', props: 'BaseTextureId:int=0 BodyPart:enum=0 MeshId:int=0 OverlayTextureId:int=0' },
  Decal: { base: 'Instance', props: 'Face:enum=5 Texture:Content Transparency:number=0 Shiny:number=20 Specular:number=0 Color3:C3=1,1,1' },
  Texture: { base: 'Decal', props: 'StudsPerTileU:number=2 StudsPerTileV:number=2' },
  Shirt: { base: 'Clothing', props: 'ShirtTemplate:Content' },
  Pants: { base: 'Clothing', props: 'PantsTemplate:Content' },
  Clothing: { base: 'Instance', abstract: true },
  ShirtGraphic: { base: 'Instance', props: 'Graphic:Content' },
  BodyColors: {
    base: 'Instance',
    props: 'HeadColor:BC=24 TorsoColor:BC=23 LeftArmColor:BC=24 RightArmColor:BC=24 LeftLegColor:BC=119 RightLegColor:BC=119',
  },

  JointInstance: { base: 'Instance', abstract: true, props: JOINT },
  Weld: { base: 'JointInstance' },
  ManualWeld: { base: 'JointInstance' },
  ManualGlue: { base: 'JointInstance' },
  Snap: { base: 'JointInstance' },
  Glue: { base: 'JointInstance' },
  Rotate: { base: 'JointInstance' },
  RotateP: { base: 'JointInstance', props: 'BaseAngle:number=0' },
  RotateV: { base: 'JointInstance', props: 'BaseAngle:number=0' },
  Motor: { base: 'JointInstance', props: 'CurrentAngle:number=0 DesiredAngle:number=0 MaxVelocity:number=0' },
  Motor6D: { base: 'Motor' },
  VelocityMotor: { base: 'JointInstance', props: 'CurrentAngle:number=0 DesiredAngle:number=0 MaxVelocity:number=0 Hole:Ref' },

  BodyMover: { base: 'Instance', abstract: true },
  BodyPosition: { base: 'BodyMover', props: 'D:number=1250 P:number=10000 MaxForce:V3=4000,4000,4000 Position:V3', aliases: { maxForce: 'MaxForce', position: 'Position' } },
  BodyVelocity: { base: 'BodyMover', props: 'P:number=1250 MaxForce:V3=4000,4000,4000 Velocity:V3=0,2,0', aliases: { maxForce: 'MaxForce', velocity: 'Velocity' } },
  BodyGyro: { base: 'BodyMover', props: 'D:number=500 P:number=3000 MaxTorque:V3=4000,0,4000 CFrame:CF', aliases: { maxTorque: 'MaxTorque', cframe: 'CFrame' } },
  BodyForce: { base: 'BodyMover', props: 'Force:V3=0,0,0', aliases: { force: 'Force' } },
  BodyThrust: { base: 'BodyMover', props: 'Force:V3=0,0,0 Location:V3', aliases: { force: 'Force', location: 'Location' } },
  BodyAngularVelocity: { base: 'BodyMover', props: 'AngularVelocity:V3=0,2,0 MaxTorque:V3=4000,4000,4000 P:number=1250', aliases: { angularvelocity: 'AngularVelocity', maxTorque: 'MaxTorque', angularVelocity: 'AngularVelocity' } },
  RocketPropulsion: { base: 'BodyMover', props: 'Target:Ref TargetOffset:V3 MaxSpeed:number=30 MaxThrust:number=4000 ThrustP:number=5 ThrustD:number=0.001 CartoonFactor:number=0.7 MaxTorque:V3=400000,400000,0' },

  Humanoid: {
    base: 'Instance',
    props: 'Health:number=100 MaxHealth:number=100 WalkSpeed:number=16 JumpPower:number=50 Jump:bool=false Sit:bool=false PlatformStand:bool=false HipHeight:number=0 AutoRotate:bool=true WalkToPoint:V3 WalkToPart:Ref TargetPoint:V3 Torso:Ref LeftLeg:Ref RightLeg:Ref MoveDirection:V3 DisplayName:string',
    aliases: { maxHealth: 'MaxHealth', Health_XML: 'Health' },
  },
  Animation: { base: 'Instance', props: 'AnimationId:Content' },
  AnimationTrack: { base: 'Instance', props: 'Animation:Ref Length:number=0 IsPlaying:bool=false', nocreate: true },
  ClickDetector: { base: 'Instance', props: 'MaxActivationDistance:number=32' },
  Explosion: { base: 'Instance', props: 'BlastPressure:number=500000 BlastRadius:number=4 Position:V3 ExplosionType:enum=1 DestroyJointRadiusPercent:number=1 Visible:bool=true' },
  ForceField: { base: 'Instance' },
  Fire: { base: 'Instance', props: 'Color:C3=0.925,0.545,0.275 SecondaryColor:C3=0.545,0.314,0.216 Enabled:bool=true Size:number=5 Heat:number=9', aliases: { size_xml: 'Size', heat_xml: 'Heat' } },
  Smoke: { base: 'Instance', props: 'Color:C3=1,1,1 Enabled:bool=true Opacity:number=0.5 RiseVelocity:number=1 Size:number=1', aliases: { opacity_xml: 'Opacity', riseVelocity_xml: 'RiseVelocity', size_xml: 'Size' } },
  Sparkles: { base: 'Instance', props: 'SparkleColor:C3=0.565,0.098,1 Enabled:bool=true', aliases: { Color: 'SparkleColor' } },
  PointLight: { base: 'Light', props: 'Range:number=8' },
  SpotLight: { base: 'Light', props: 'Range:number=16 Angle:number=90 Face:enum=5' },
  SurfaceLight: { base: 'Light', props: 'Range:number=16 Angle:number=90 Face:enum=5' },
  Light: { base: 'Instance', abstract: true, props: 'Brightness:number=1 Color:C3=1,1,1 Enabled:bool=true Shadows:bool=false' },
  Sound: {
    base: 'Instance',
    props: 'SoundId:Content Volume:number=0.5 Pitch:number=1 Looped:bool=false PlayOnRemove:bool=false IsPlaying:bool=false IsPaused:bool=false TimePosition:number=0 TimeLength:number=0 MinDistance:number=10 MaxDistance:number=10000 EmitterSize:number=10 RollOffMode:int=0 SoundGroup:Ref',
    aliases: { PlaybackSpeed: 'Pitch', Playing: 'IsPlaying' },
  },
  StockSound: { base: 'Sound' },
  Sky: {
    base: 'Instance',
    props: 'CelestialBodiesShown:bool=true StarCount:int=3000 SkyboxBk:Content SkyboxDn:Content SkyboxFt:Content SkyboxLf:Content SkyboxRt:Content SkyboxUp:Content SunTextureId:Content MoonTextureId:Content SunAngularSize:number=21 MoonAngularSize:number=11',
  },
  Dialog: { base: 'Instance', props: 'ConversationDistance:number=25 InitialPrompt:string Purpose:enum=1 Tone:enum=0 InUse:bool=false' },
  DialogChoice: { base: 'Instance', props: 'ResponseDialog:string UserDialog:string' },
  SelectionBox: { base: 'Instance', props: 'Adornee:Ref Color:BC=23 Transparency:number=0 Visible:bool=true' },
  FloorWire: { base: 'Instance', props: 'Color:BC=24 From:Ref To:Ref Transparency:number=0 WireRadius:number=0.0625 Visible:bool=true' },
  Message: { base: 'Instance', props: 'Text:string' },
  Hint: { base: 'Message' },

  Script: { base: 'BaseScript', props: 'Source:string LinkedSource:Content' },
  LocalScript: { base: 'Script' },
  ModuleScript: { base: 'Instance', props: 'Source:string LinkedSource:Content' },
  BaseScript: { base: 'Instance', abstract: true, props: 'Disabled:bool=false' },
  CoreScript: { base: 'BaseScript', props: 'Source:string' },

  ValueBase: { base: 'Instance', abstract: true },
  IntValue: { base: 'ValueBase', props: VALUE('int', '=0') },
  NumberValue: { base: 'ValueBase', props: VALUE('number', '=0') },
  StringValue: { base: 'ValueBase', props: VALUE('string') },
  BoolValue: { base: 'ValueBase', props: VALUE('bool', '=false') },
  ObjectValue: { base: 'ValueBase', props: VALUE('Ref') },
  Vector3Value: { base: 'ValueBase', props: VALUE('V3') },
  CFrameValue: { base: 'ValueBase', props: VALUE('CF') },
  Color3Value: { base: 'ValueBase', props: VALUE('C3') },
  BrickColorValue: { base: 'ValueBase', props: VALUE('BC', '=194') },
  RayValue: { base: 'ValueBase', props: 'Value:any' },
  IntConstrainedValue: { base: 'ValueBase', props: 'Value:int=0 MinValue:int=0 MaxValue:int=10', aliases: { value: 'Value', ConstrainedValue: 'Value' } },
  DoubleConstrainedValue: { base: 'ValueBase', props: 'Value:number=0 MinValue:number=0 MaxValue:number=1', aliases: { value: 'Value', ConstrainedValue: 'Value' } },
  BindableEvent: { base: 'Instance' },
  BindableFunction: { base: 'Instance' },
  RemoteEvent: { base: 'Instance' },
  RemoteFunction: { base: 'Instance' },

  GuiBase: { base: 'Instance', abstract: true },
  GuiBase2d: { base: 'GuiBase', abstract: true, props: 'AbsolutePosition:V2 AbsoluteSize:V2' },
  LayerCollector: { base: 'GuiBase2d', abstract: true, props: 'Enabled:bool=true' },
  ScreenGui: { base: 'LayerCollector', props: 'ResetOnSpawn:bool=true DisplayOrder:int=0' },
  GuiMain: { base: 'ScreenGui' },
  BillboardGui: { base: 'LayerCollector', props: 'Active:bool=false Adornee:Ref AlwaysOnTop:bool=false Size:UD2 SizeOffset:V2 StudsOffset:V3 ExtentsOffset:V3' },
  SurfaceGui: { base: 'LayerCollector', props: 'Adornee:Ref Face:enum=5 CanvasSize:V2=800,600' },
  GuiObject: { base: 'GuiBase2d', abstract: true, props: GUI_OBJECT },
  Frame: { base: 'GuiObject', props: 'Style:enum=0' },
  ScrollingFrame: { base: 'GuiObject', props: 'CanvasSize:UD2 CanvasPosition:V2 ScrollBarThickness:int=12 ScrollingEnabled:bool=true' },
  TextLabel: { base: 'GuiObject', props: TEXT },
  TextButton: { base: 'GuiButton', props: TEXT },
  TextBox: { base: 'GuiObject', props: TEXT + ' ClearTextOnFocus:bool=true MultiLine:bool=false' },
  ImageLabel: { base: 'GuiObject', props: IMAGE },
  ImageButton: { base: 'GuiButton', props: IMAGE },
  GuiButton: { base: 'GuiObject', abstract: true, props: 'AutoButtonColor:bool=true Modal:bool=false Selected:bool=false Style:enum=0' },

  Pose: { base: 'Instance', props: 'CFrame:CF Weight:number=1' },
  Keyframe: { base: 'Instance', props: 'Time:number=0' },
  KeyframeSequence: { base: 'Instance', props: 'Loop:bool=true' },
  Attachment: { base: 'Instance', props: 'CFrame:CF Visible:bool=false' },
  Mouse: { base: 'Instance', abstract: true, props: 'Hit:CF Target:Ref Origin:CF X:int=0 Y:int=0 ViewSizeX:int=0 ViewSizeY:int=0 Icon:Content UnitRay:any TargetFilter:Ref TargetSurface:enum=0' },
  PlayerMouse: { base: 'Mouse' },
};

for (const [name, items] of Object.entries(ENUMS2018)) {
  const e = ENUMS[name] || (ENUMS[name] = {});
  for (const [k, v] of Object.entries(items)) if (!(k in e)) e[k] = v;
}
ENUMS.UserInputType.None = 21;

const ERA2018_PROPS = new Set();
const SKIP2018 = new Set(['Instance.Parent', 'Instance.ClassName', 'Instance.className', 'Instance.DataCost', 'BasePart.Position', 'BasePart.Rotation', 'BasePart.Orientation', 'BasePart.ReceiveAge', 'BasePart.SpecificGravity', 'Tool.GripPos', 'Tool.GripForward', 'Tool.GripRight', 'Tool.GripUp', 'Accoutrement.AttachmentPos', 'Accoutrement.AttachmentForward', 'Accoutrement.AttachmentRight', 'Accoutrement.AttachmentUp', 'Attachment.Position', 'Attachment.Orientation', 'Attachment.Rotation', 'Attachment.Axis', 'Attachment.SecondaryAxis', 'Attachment.WorldPosition', 'Attachment.WorldOrientation', 'Attachment.WorldRotation', 'Attachment.WorldAxis', 'Attachment.WorldSecondaryAxis', 'Attachment.WorldCFrame', 'Model.PrimaryPart', 'Players.NumPlayers', 'Camera.CoordinateFrame', 'Camera.ViewportSize', 'Lighting.ClockTime', 'Mouse.Hit', 'Mouse.UnitRay', 'Mouse.Origin', 'Humanoid.Torso', 'Humanoid.LeftLeg', 'Humanoid.RightLeg', 'Humanoid.SeatPart', 'Humanoid.FloorMaterial', 'Humanoid.RootPart', 'Player.Character', 'GuiObject.Transparency', 'TextLabel.TextFits', 'TextButton.TextFits', 'TextBox.TextFits', 'TextLabel.TextBounds', 'TextButton.TextBounds', 'TextBox.TextBounds', 'TextLabel.LocalizedText', 'TextButton.LocalizedText', 'TextBox.LocalizedText', 'GuiBase2d.AbsolutePosition', 'GuiBase2d.AbsoluteSize', 'GuiBase2d.AbsoluteRotation', 'GuiBase2d.Localize', 'ScrollingFrame.AbsoluteWindowSize', 'ScrollingFrame.CanvasPosition', 'UIGridStyleLayout.AbsoluteContentSize', 'Sound.IsPlaying', 'Sound.IsPaused', 'Sound.IsLoaded', 'Sound.TimeLength', 'Sound.PlaybackLoudness', 'Sound.Playing', 'AnimationTrack.IsPlaying', 'AnimationTrack.Length', 'AnimationTrack.TimePosition', 'AnimationTrack.Speed', 'AnimationTrack.WeightCurrent', 'AnimationTrack.WeightTarget', 'AnimationTrack.Animation', 'Players.LocalPlayer', 'DataModel.Workspace', 'DataModel.lighting', 'DataModel.workspace', 'Workspace.Terrain', 'Player.Team', 'DataModel.PlaceId', 'DataModel.JobId', 'DataModel.CreatorId', 'DataModel.GameId']);
for (const [name, def] of Object.entries(DEFS2018)) {
  const seen = new Set();
  const props = def.props.split(' ').filter(Boolean).filter((tok) => {
    const pn = tok.split(':')[0];
    if (SKIP2018.has(name + '.' + pn) || seen.has(pn.toLowerCase())) return false;
    seen.add(pn.toLowerCase());
    return true;
  });
  const have = new Set();
  const chainOf = (c) => DEFS[c] || DEFS2018[c];
  for (let c = DEFS[name] ? DEFS[name].base : def.base; c && chainOf(c); c = chainOf(c).base) for (const tok of (chainOf(c).props || '').split(/\s+/)) if (tok) have.add(tok.split(':')[0].toLowerCase());
  const mine = DEFS[name];
  if (mine) for (const tok of (mine.props || '').split(/\s+/)) if (tok) have.add(tok.split(':')[0].toLowerCase());
  const extra = props.filter((tok) => !have.has(tok.split(':')[0].toLowerCase()));
  for (const tok of extra) ERA2018_PROPS.add(name + '.' + tok.split(':')[0]);
  if (!mine) {
    DEFS[name] = { base: def.base, props: extra.join(' '), abstract: def.abstract, service: def.service, era: 2018 };
    continue;
  }
  if (extra.length) mine.props = [mine.props || '', ...extra].join(' ').trim();
}

DEFS.MeshPart.props = [DEFS.MeshPart.props || '', 'InitialSize:V3=1,1,1'].join(' ').trim();
DEFS.PartOperation.props = [DEFS.PartOperation.props || '', 'AssetId:Content InitialSize:V3=1,1,1'].join(' ').trim();

const TYPE_ALIASES = { size: 'Size', shape: 'Shape', formFactorRaw: 'FormFactor', formFactor: 'FormFactor', archivable: 'Archivable', style: 'Style' };

function parseDefault(type, raw) {
  if (raw === undefined) {
    switch (type) {
      case 'string': case 'Content': return '';
      case 'bool': return false;
      case 'int': case 'number': case 'enum': return 0;
      case 'V3': return [0, 0, 0];
      case 'V2': return [0, 0];
      case 'C3': return [0, 0, 0];
      case 'CF': return [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
      case 'UD2': return [0, 0, 0, 0];
      case 'BC': return 194;
      case 'UD': case 'NR': return [0, 0];
      case 'Rect': return [0, 0, 0, 0];
      case 'NS': return [0, 0, 0, 1, 0, 0];
      case 'CS': return [0, 1, 1, 1, 0, 1, 1, 1, 1, 0];
      default: return null;
    }
  }
  switch (type) {
    case 'string': case 'Content': return raw;
    case 'bool': return raw === 'true';
    case 'int': case 'number': case 'enum': case 'BC': return +raw;
    case 'V3': case 'V2': case 'C3': case 'UD2': case 'UD': case 'NR': case 'Rect': case 'NS': case 'CS': return raw.split(',').map(Number);
    case 'CF': {
      const p = raw.split(',').map(Number);
      return [p[0] || 0, p[1] || 0, p[2] || 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    default: return null;
  }
}

export const CLASSES = new Map();
const CLASS_ENUM_PROPS = { Frame: { Style: 'FrameStyle' }, GuiButton: { Style: 'ButtonStyle' }, TrussPart: { Style: 'Style' } };

for (const [name, def] of Object.entries(DEFS)) {
  const props = new Map();
  for (const tok of (def.props || '').split(/\s+/).filter(Boolean)) {
    const m = /^([\w]+):(\w+)(?:=(.*))?$/.exec(tok);
    if (!m) throw new Error('bad prop def ' + tok);
    const [, pn, type, raw] = m;
    props.set(pn, { type, def: parseDefault(type, raw), enumType: type === 'enum' ? (CLASS_ENUM_PROPS[name] && CLASS_ENUM_PROPS[name][pn]) || ENUM_PROPS[pn] || (ENUM_PROPS2018[name] && ENUM_PROPS2018[name][pn]) || null : null });
  }
  CLASSES.set(name, { name, base: def.base || null, own: props, aliases: def.aliases || {}, abstract: !!def.abstract, service: !!def.service, nocreate: !!def.nocreate, era: def.era || 2012, all: null, chain: null });
}

function resolve(c) {
  if (c.all) return c;
  const all = new Map();
  const chain = [c.name];
  const aliases = { ...TYPE_ALIASES };
  if (c.base) {
    const b = resolve(CLASSES.get(c.base));
    for (const [k, v] of b.all) all.set(k, v);
    chain.push(...b.chain);
    Object.assign(aliases, b.aliasMap);
  }
  for (const [k, v] of c.own) all.set(k, v);
  Object.assign(aliases, c.aliases);
  c.all = all;
  c.chain = chain;
  c.chainSet = new Set(chain);
  c.aliasMap = aliases;
  return c;
}

for (const c of CLASSES.values()) resolve(c);

export function classInfo(name) {
  return CLASSES.get(name) || null;
}

export function isA(cls, base) {
  const c = CLASSES.get(cls);
  return c ? c.chainSet.has(base) : cls === base || base === 'Instance';
}

export function canonicalProp(cls, name) {
  const c = CLASSES.get(cls);
  if (!c) return name;
  if (c.all.has(name)) return name;
  const a = c.aliasMap[name];
  if (a && c.all.has(a)) return a;
  const up = name.charAt(0).toUpperCase() + name.slice(1);
  if (c.all.has(up)) return up;
  return null;
}

export function propInfo(cls, name) {
  const c = CLASSES.get(cls);
  return c ? c.all.get(name) || null : null;
}

export function isCreatable(name) {
  const c = CLASSES.get(name);
  return !!c && !c.abstract && !c.service && !c.nocreate && name !== 'DataModel' && name !== 'Player';
}

export function isService(name) {
  const c = CLASSES.get(name);
  return !!c && c.service;
}

export const REPLICATED_SERVICES = ['Workspace', 'Lighting', 'StarterGui', 'StarterPack', 'Teams', 'Players', 'SoundService', 'ReplicatedStorage', 'ReplicatedFirst', 'Chat', 'JointsService'];

export function enumName(enumType, value) {
  const e = ENUMS[enumType];
  if (!e) return null;
  for (const [k, v] of Object.entries(e)) if (v === value) return k;
  return null;
}

export function propEra(cls, name) {
  for (let c = CLASSES.get(cls); c; c = c.base ? CLASSES.get(c.base) : null) if (ERA2018_PROPS.has(c.name + '.' + name)) return 2018;
  return 2012;
}

export function classEra(cls) {
  const c = CLASSES.get(cls);
  return c ? c.era : 2012;
}
