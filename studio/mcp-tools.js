export const TOOLS = [
 {
  "name": "get_place_info",
  "description": "Describe the open place: id, name, era, services, object counts, selection, undo state and whether it has unsaved changes.",
  "inputSchema": {
   "type": "object",
   "properties": {},
   "required": [],
   "additionalProperties": false
  }
 },
 {
  "name": "list_children",
  "description": "List the children of an instance (default: the DataModel, which lists the services) with class, name, path, id and child count, optionally to a depth.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "instance": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    },
    "depth": {
     "type": "integer",
     "minimum": 1,
     "maximum": 6,
     "description": "Levels to list, default 1."
    },
    "limit": {
     "type": "integer",
     "minimum": 1,
     "maximum": 1000,
     "description": "Maximum nodes, default 300."
    }
   },
   "required": [],
   "additionalProperties": false
  }
 },
 {
  "name": "get_instance",
  "description": "Get one instance: class, name, path, id, parent, all properties as JSON values, a summary of its children, and for scripts the source length.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "instance": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    }
   },
   "required": [
    "instance"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "search_instances",
  "description": "Find descendants of a root by name and/or class.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "root": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    },
    "name": {
     "type": "string",
     "description": "Case-insensitive substring of the name, or exact when exact is true."
    },
    "exact": {
     "type": "boolean"
    },
    "class": {
     "type": "string",
     "description": "ClassName or a base class such as BasePart."
    },
    "limit": {
     "type": "integer",
     "minimum": 1,
     "maximum": 500
    }
   },
   "required": [],
   "additionalProperties": false
  }
 },
 {
  "name": "create_instance",
  "description": "Create an instance. Undoable.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "class": {
     "type": "string"
    },
    "parent": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    },
    "name": {
     "type": "string"
    },
    "properties": {
     "type": "object",
     "description": "Property name to value. Numbers, strings and booleans as is; enums by name or number; BrickColor by number or name; Vector3 as [x,y,z]; Color3 as \"#rrggbb\" or [r,g,b] in 0-255; CFrame as [x,y,z] or 12 numbers; UDim2 as [xScale,xOffset,yScale,yOffset]; Position sets a part position; Parent and object references by path.",
     "additionalProperties": true
    }
   },
   "required": [
    "class",
    "parent"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "set_properties",
  "description": "Set one or more properties on an instance in one undoable step. Nothing is changed if any property is invalid.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "instance": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    },
    "properties": {
     "type": "object",
     "description": "Property name to value. Numbers, strings and booleans as is; enums by name or number; BrickColor by number or name; Vector3 as [x,y,z]; Color3 as \"#rrggbb\" or [r,g,b] in 0-255; CFrame as [x,y,z] or 12 numbers; UDim2 as [xScale,xOffset,yScale,yOffset]; Position sets a part position; Parent and object references by path.",
     "additionalProperties": true
    }
   },
   "required": [
    "instance",
    "properties"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "delete_instance",
  "description": "Delete an instance and its descendants. Undoable. Services cannot be deleted.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "instance": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    }
   },
   "required": [
    "instance"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "clone_instance",
  "description": "Clone an instance with its descendants into a parent (default: the same parent). Undoable.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "instance": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    },
    "parent": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    },
    "name": {
     "type": "string"
    }
   },
   "required": [
    "instance"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "reparent_instance",
  "description": "Move an instance under a new parent. Undoable.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "instance": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    },
    "parent": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    }
   },
   "required": [
    "instance",
    "parent"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "get_script_source",
  "description": "Read the source of a Script, LocalScript or ModuleScript.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "instance": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    }
   },
   "required": [
    "instance"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "set_script_source",
  "description": "Replace the source of a Script, LocalScript or ModuleScript. Undoable.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "instance": {
     "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
     "type": [
      "string",
      "integer"
     ]
    },
    "source": {
     "type": "string"
    }
   },
   "required": [
    "instance",
    "source"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "get_selection",
  "description": "List the instances selected in Studio.",
  "inputSchema": {
   "type": "object",
   "properties": {},
   "required": [],
   "additionalProperties": false
  }
 },
 {
  "name": "set_selection",
  "description": "Select instances in Studio (an empty list clears the selection).",
  "inputSchema": {
   "type": "object",
   "properties": {
    "instances": {
     "type": "array",
     "items": {
      "description": "An instance: a dotted path from the DataModel such as \"Workspace.Model.Part\" (a leading \"game.\" is optional, escape a literal dot in a name as \"\\.\"), or the numeric instance id from earlier results.",
      "type": [
       "string",
       "integer"
      ]
     }
    }
   },
   "required": [
    "instances"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "run_code",
  "description": "Run Lua in Studio's command bar and return what it printed during the wait. Changes it makes to the place are undoable as one step.",
  "inputSchema": {
   "type": "object",
   "properties": {
    "code": {
     "type": "string"
    },
    "wait_ms": {
     "type": "integer",
     "minimum": 300,
     "maximum": 10000,
     "description": "How long to collect output, default 1200."
    }
   },
   "required": [
    "code"
   ],
   "additionalProperties": false
  }
 },
 {
  "name": "undo",
  "description": "Undo the last change in Studio.",
  "inputSchema": {
   "type": "object",
   "properties": {},
   "required": [],
   "additionalProperties": false
  }
 },
 {
  "name": "redo",
  "description": "Redo the last undone change in Studio.",
  "inputSchema": {
   "type": "object",
   "properties": {},
   "required": [],
   "additionalProperties": false
  }
 }
];
