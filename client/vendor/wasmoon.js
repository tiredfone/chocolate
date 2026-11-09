import lodash from "lodash";
//#region src/js-type-bind.ts
var JsType = class JsType {
	static create(name, is) {
		return new JsType(name, is);
	}
	static decorate(target) {
		const jsType = new JsType();
		jsType.value = target;
		return jsType;
	}
	constructor(name, is) {
		this._priority = 0;
		this._name = null;
		this._name = name ?? null;
		this.match = is;
	}
	_pushMetaTable(thread) {
		if (this._gc) {
			thread.luaApi.lua_pushcfunction(thread.address, this._gc);
			thread.luaApi.lua_setfield(thread.address, -2, "__gc");
		}
		if (this._call) {
			thread.luaApi.lua_pushcfunction(thread.address, this._call);
			thread.luaApi.lua_setfield(thread.address, -2, "__call");
		}
		for (const op of [
			"add",
			"sub",
			"mul",
			"div",
			"mod",
			"pow",
			"unm",
			"concat",
			"len",
			"eq",
			"lt",
			"le",
			"index",
			"newindex",
			"metatable",
			"tostring"
		]) if (this[`_${op}`]) {
			const target = this[`_${op}`];
			if (typeof target === "number") thread.luaApi.lua_pushcfunction(thread.address, target);
			else thread.pushValue(this[`_${op}`]);
			thread.luaApi.lua_setfield(thread.address, -2, `__${op}`);
		}
	}
	bind(thread) {
		thread.luaApi.luaL_newmetatable(thread.address, this._name);
		thread.luaApi.lua_pushstring(thread.address, this._name);
		thread.luaApi.lua_setfield(thread.address, -2, "__name");
		this._pushMetaTable(thread);
		thread.luaApi.lua_pop(thread.address, 1);
		thread.bindType(this);
	}
	push(pushMethod) {
		this._push = pushMethod;
		return this;
	}
	priority(priority) {
		this._priority = priority;
		return this;
	}
	name(name) {
		this._name = name;
		return this;
	}
	gc(funcPointer) {
		this._gc = funcPointer;
		return this;
	}
	call(funcPointer) {
		this._call = funcPointer;
		return this;
	}
	metatable(value) {
		this._metatable = value;
		return this;
	}
	tostring(value) {
		this._tostring = value;
		return this;
	}
	index(funcPointer) {
		this._index = funcPointer;
		return this;
	}
	newindex(funcPointer) {
		this._newindex = funcPointer;
		return this;
	}
	operation(op, func) {
		const metakey = {
			"+": "_add",
			"add": "_add",
			"-": "_sub",
			"sub": "_sub",
			"*": "_mul",
			"mul": "_mul",
			"/": "_div",
			"div": "_div",
			"%": "_mod",
			"mod": "_mod",
			"^": "_pow",
			"pow": "_pow",
			"unm": "_unm",
			"..": "_concat",
			"contact": "_concat",
			"#": "_len",
			"len": "_len",
			"==": "_eq",
			"eq": "_eq",
			"<": "_lt",
			"lt": "_lt",
			"<=": "_le",
			"le": "_le"
		}[op];
		if (!metakey) throw new Error(`Invalid operation: ${op}`);
		this[metakey] = func;
		return this;
	}
};
//#endregion
//#region src/definitions.ts
const PointerSize = 4;
const LUA_MULTRET = -1;
const LUA_REGISTRYINDEX = -1e4;
const LUA_ENVIRONINDEX = -10001;
const LUA_GLOBALSINDEX = -10002;
const LUA_IDSIZE = 60;
let LuaReturn = /* @__PURE__ */ function(LuaReturn) {
	LuaReturn[LuaReturn["Ok"] = 0] = "Ok";
	LuaReturn[LuaReturn["Yield"] = 1] = "Yield";
	LuaReturn[LuaReturn["ErrorRun"] = 2] = "ErrorRun";
	LuaReturn[LuaReturn["ErrorSyntax"] = 3] = "ErrorSyntax";
	LuaReturn[LuaReturn["ErrorMem"] = 4] = "ErrorMem";
	LuaReturn[LuaReturn["ErrorErr"] = 5] = "ErrorErr";
	LuaReturn[LuaReturn["ErrorFile"] = 6] = "ErrorFile";
	return LuaReturn;
}({});
let LuaType = /* @__PURE__ */ function(LuaType) {
	LuaType[LuaType["None"] = -1] = "None";
	LuaType[LuaType["Nil"] = 0] = "Nil";
	LuaType[LuaType["Boolean"] = 1] = "Boolean";
	LuaType[LuaType["LightUserdata"] = 2] = "LightUserdata";
	LuaType[LuaType["Number"] = 3] = "Number";
	LuaType[LuaType["String"] = 4] = "String";
	LuaType[LuaType["Table"] = 5] = "Table";
	LuaType[LuaType["Function"] = 6] = "Function";
	LuaType[LuaType["Userdata"] = 7] = "Userdata";
	LuaType[LuaType["Thread"] = 8] = "Thread";
	return LuaType;
}({});
let LuaEventCodes = /* @__PURE__ */ function(LuaEventCodes) {
	LuaEventCodes[LuaEventCodes["Call"] = 0] = "Call";
	LuaEventCodes[LuaEventCodes["Ret"] = 1] = "Ret";
	LuaEventCodes[LuaEventCodes["Line"] = 2] = "Line";
	LuaEventCodes[LuaEventCodes["Count"] = 3] = "Count";
	LuaEventCodes[LuaEventCodes["TailCall"] = 4] = "TailCall";
	return LuaEventCodes;
}({});
let LuaEventMasks = /* @__PURE__ */ function(LuaEventMasks) {
	LuaEventMasks[LuaEventMasks["Call"] = 1] = "Call";
	LuaEventMasks[LuaEventMasks["Ret"] = 2] = "Ret";
	LuaEventMasks[LuaEventMasks["Line"] = 4] = "Line";
	LuaEventMasks[LuaEventMasks["Count"] = 8] = "Count";
	return LuaEventMasks;
}({});
let LuaLibraries = /* @__PURE__ */ function(LuaLibraries) {
	LuaLibraries["Base"] = "_G";
	LuaLibraries["Coroutine"] = "coroutine";
	LuaLibraries["Table"] = "table";
	LuaLibraries["IO"] = "io";
	LuaLibraries["OS"] = "os";
	LuaLibraries["String"] = "string";
	LuaLibraries["UTF8"] = "utf8";
	LuaLibraries["Math"] = "math";
	LuaLibraries["Debug"] = "debug";
	LuaLibraries["Package"] = "package";
	return LuaLibraries;
}({});
var LuaTimeoutError = class extends Error {};
//#endregion
//#region src/lua-debug.ts
var LuaDebug = class {
	static {
		this.structSize = 100;
	}
	constructor(pointer, module, message) {
		this.tracebacks = [];
		this.pointer = pointer;
		this.module = module;
		this.message = message;
	}
	read() {
		let baseIndex = this.pointer >> 2;
		const event = this.module.HEAPU32.at(baseIndex++);
		const name = this.readStructString(baseIndex++);
		const namewhat = this.readStructString(baseIndex++);
		const what = this.readStructString(baseIndex++);
		const source = this.readStructString(baseIndex++);
		const currentline = this.module.HEAPU32.at(baseIndex++);
		const nups = this.module.HEAPU32.at(baseIndex++);
		const linedefined = this.module.HEAPU32.at(baseIndex++);
		const lastlinedefined = this.module.HEAPU32.at(baseIndex++);
		const short_src = this.module.UTF8ToString(baseIndex << 2, 60);
		const i_ci = this.module.HEAPU32.at(baseIndex + 15);
		const traceback = {
			event,
			name: name || "?",
			namewhat,
			what,
			source,
			currentline: currentline === 4294967295 ? "?" : currentline,
			nups,
			linedefined: linedefined === 4294967295 ? "?" : linedefined,
			lastlinedefined: lastlinedefined === 4294967295 ? "?" : lastlinedefined,
			short_src,
			i_ci
		};
		this.tracebacks.push(traceback);
	}
	getMessage() {
		const result = [];
		result.push(`${this.tracebacks[0]?.short_src || "?"}:${this.tracebacks[0]?.currentline || "?"}: ${this.message}`);
		if (this.tracebacks.length) result.push("stack traceback:");
		for (const traceback of this.tracebacks) result.push(`    at ${traceback.name} (${traceback.short_src}:${traceback.currentline}) (${traceback.what}:${traceback.namewhat})`);
		return result.join("\n");
	}
	getTracebacks() {
		return this.tracebacks;
	}
	readStructString(structPointer) {
		return this.module.UTF8ToString(this.module.HEAPU32.at(structPointer));
	}
};
//#endregion
//#region src/utils/map-transform.ts
let DictType = /* @__PURE__ */ function(DictType) {
	DictType[DictType["Array"] = 0] = "Array";
	DictType[DictType["Object"] = 1] = "Object";
	DictType[DictType["Map"] = 2] = "Map";
	return DictType;
}({});
const detectDuplicateKeys = (keys) => {
	const set = /* @__PURE__ */ new Set();
	for (const _key of keys) {
		const key = String(_key);
		if (set.has(key)) return true;
		set.add(key);
	}
	return false;
};
const detectDictType = (keys) => {
	if (keys.some((key) => !["number", "string"].includes(typeof key)) || detectDuplicateKeys(keys)) return 2;
	else if (keys.some((key) => typeof key === "number")) return 0;
	else return 1;
};
const mapTransform = (map, options = {}) => {
	if (!options.refs) options.refs = /* @__PURE__ */ new Map();
	if (options.refs.has(map)) return options.refs.get(map);
	const keys = [...map.keys()];
	const dictType = options.dictType === void 0 ? detectDictType(keys) : options.dictType;
	if (dictType === 2) return map;
	const result = dictType === 0 ? [] : {};
	options.refs.set(map, result);
	for (const key of keys) {
		const value = map.get(key);
		if (value instanceof Map) {
			result[key] = mapTransform(value, options);
			continue;
		}
		result[key] = value;
	}
	return result;
};
//#endregion
//#region src/table.ts
var LuaTable = class {
	constructor(thread, ref, pointer) {
		this.alive = true;
		this.thread = thread;
		this.ref = ref;
		this.pointer = pointer;
	}
	[Symbol.for("nodejs.util.inspect.custom")]() {
		return this.toString();
	}
	$get(key) {
		if (!this.alive) throw new Error("table is destroyed");
		return this.getTableValue(key);
	}
	$set(key, value) {
		return this.setTableValue(key, value);
	}
	$istable() {
		return true;
	}
	$getRef() {
		return this.ref;
	}
	$detach(dictType) {
		this.thread.luaApi.lua_rawgeti(this.thread.address, LUA_REGISTRYINDEX, this.ref);
		const map = this.detachTable(-1);
		this.thread.pop();
		return mapTransform(map, { dictType: dictType ?? 2 });
	}
	$isAlive() {
		return this.alive;
	}
	$destroy() {
		this.thread.luaApi.luaL_unref(this.thread.address, LUA_REGISTRYINDEX, this.ref);
		this.thread.luaApi.pointerRefs.delete(this.pointer);
		this.alive = false;
	}
	toString() {
		return `[LuaTable 0x${this.pointer.toString(16)} *${this.ref} ${this.alive ? "Alive" : "Destroyed"}]`;
	}
	getTableValue(key) {
		this.thread.luaApi.lua_rawgeti(this.thread.address, LUA_REGISTRYINDEX, this.ref);
		this.thread.pushValue(key);
		this.thread.luaApi.lua_gettable(this.thread.address, -2);
		const result = this.thread.getValue(-1);
		this.thread.pop(2);
		return result;
	}
	setTableValue(key, value) {
		this.thread.luaApi.lua_rawgeti(this.thread.address, LUA_REGISTRYINDEX, this.ref);
		this.thread.pushValue(key);
		key = this.thread.getValue(-1);
		this.thread.pushValue(value);
		value = this.thread.getValue(-1);
		this.thread.luaApi.lua_settable(this.thread.address, -3);
		this.thread.pop(1);
		return true;
	}
	detachTable(index, refs) {
		index = this.thread.luaApi.lua_absindex(this.thread.address, index);
		if (!refs) refs = /* @__PURE__ */ new Map();
		const pointer = this.thread.luaApi.lua_topointer(this.thread.address, index);
		if (refs.has(pointer)) return refs.get(pointer);
		const result = /* @__PURE__ */ new Map();
		refs.set(pointer, result);
		this.thread.luaApi.lua_pushnil(this.thread.address);
		while (this.thread.luaApi.lua_next(this.thread.address, index) !== 0) {
			const key = this.thread.getType(-2) === 5 ? this.detachTable(-2, refs) : this.thread.getValue(-2);
			const value = this.thread.getType(-1) === 5 ? this.detachTable(-1, refs) : this.thread.getValue(-1);
			result.set(key, value);
			this.thread.pop();
		}
		return result;
	}
};
const getTable = (thread, index) => {
	const pointer = thread.luaApi.lua_topointer(thread.address, index);
	if (thread.luaApi.pointerRefs.has(pointer)) return thread.luaApi.pointerRefs.get(pointer).proxy;
	thread.luaApi.lua_pushvalue(thread.address, index);
	const table = new LuaTable(thread, thread.luaApi.luaL_ref(thread.address, LUA_REGISTRYINDEX), pointer);
	const { proxy, revoke } = Proxy.revocable(table, {
		get: (target, key) => {
			if (!target.$isAlive() && key !== "toString") throw new Error(`${target.toString()} is destroyed`);
			if (target[key]) return target[key].bind(target);
			if (key === Symbol.toStringTag) return () => "LuaTable";
			if (typeof key === "symbol") return;
			return target.$get(key);
		},
		set: (target, key, value) => {
			if (!target.$isAlive()) throw new Error(`${target.toString()} is destroyed`);
			return target.$set(key, value);
		}
	});
	thread.luaApi.pointerRefs.set(pointer, {
		proxy,
		revoke
	});
	return proxy;
};
//#endregion
//#region src/multireturn.ts
var MultiReturn = class extends Array {};
//#endregion
//#region src/thread.ts
const INSTRUCTION_HOOK_COUNT = 1e3;
var LuaThread = class LuaThread {
	constructor(luaApi, address, parent) {
		this.closed = false;
		this.types = [];
		this.luaApi = luaApi;
		this.address = address;
		this.parent = parent;
		this.types = parent?.types || [];
	}
	newThread() {
		const address = this.luaApi.lua_newthread(this.address);
		if (!address) throw new Error("lua_newthread returned a null pointer");
		return new LuaThread(this.luaApi, address, this.parent || this);
	}
	bindType(type) {
		this.types.unshift(type);
		this.types.sort((a, b) => b._priority - a._priority);
	}
	getTop() {
		return this.luaApi.lua_gettop(this.address);
	}
	setTop(index) {
		this.luaApi.lua_settop(this.address, index);
	}
	remove(index) {
		return this.luaApi.lua_remove(this.address, index);
	}
	getType(index) {
		return this.luaApi.lua_type(this.address, index);
	}
	isBasicValue(index) {
		const type = this.luaApi.lua_type(this.address, index);
		return [
			0,
			1,
			3,
			4
		].includes(type);
	}
	pushBasicValue(target, options) {
		if (target === void 0 || target === null) this.luaApi.lua_pushnil(this.address);
		else if (typeof target === "number") {
			if (Number.isInteger(target)) this.luaApi.lua_pushinteger(this.address, target);
			else this.luaApi.lua_pushnumber(this.address, target);
		} else if (typeof target === "string") this.luaApi.lua_pushstring(this.address, target);
		else if (typeof target === "boolean") this.luaApi.lua_pushboolean(this.address, target ? 1 : 0);
		else if (lodash.isPlainObject(target) || lodash.isArray(target)) this.pushTable(target, options);
		else return false;
		return true;
	}
	pushValue(target, options = {}) {
		const startTop = this.getTop();
		if (target instanceof JsType) {
			if (target._push) target._push({
				thread: this,
				target: target.value,
				options
			});
			else {
				if (!this.pushBasicValue(target.value, options)) {
					const ref = this.luaApi.ref(target.value);
					const luaPointer = this.luaApi.lua_newuserdata(this.address, 4);
					this.luaApi.module.setValue(luaPointer, ref, "*");
				}
				this.luaApi.lua_createtable(this.address, 0, 0);
				target._pushMetaTable(this);
				this.luaApi.lua_setmetatable(this.address, -2);
			}
		} else if (target instanceof LuaThread) {
			if (!(this.luaApi.lua_pushthread(target.address) === 1)) this.luaApi.lua_xmove(target.address, this.address, 1);
			return;
		} else if (target && target.$istable) {
			const ref = target.$getRef();
			this.luaApi.lua_rawgeti(this.address, LUA_REGISTRYINDEX, ref);
			return;
		} else if (!this.pushBasicValue(target, options)) {
			const type = this.types.find((t) => t.match(target));
			if (type._push) type._push({
				thread: this,
				target,
				options,
				type
			});
			else {
				const ref = this.luaApi.ref(target);
				const luaPointer = this.luaApi.lua_newuserdata(this.address, 4);
				this.luaApi.module.setValue(luaPointer, ref, "*");
				this.luaApi.luaL_getmetatable(this.address, type?._name);
				this.luaApi.lua_setmetatable(this.address, -2);
			}
		}
		if (this.getTop() !== startTop + 1) throw new Error(`pushValue expected stack size ${startTop + 1}, got ${this.getTop()}`);
	}
	pushTable(object, options = {}) {
		if (!options.refs) options.refs = /* @__PURE__ */ new Map();
		else {
			const ref = options.refs.get(object);
			if (ref) {
				this.luaApi.lua_rawgeti(this.address, LUA_REGISTRYINDEX, ref);
				return;
			}
		}
		const arrIndexs = [];
		const recIndexs = [];
		if (lodash.isArray(object)) Object.keys(object).forEach((key) => {
			if (!isNaN(Number(key))) arrIndexs.push(Number(key));
			else recIndexs.push(key);
		});
		else if (lodash.isPlainObject(object)) recIndexs.push(...Object.keys(object));
		this.luaApi.lua_createtable(this.address, arrIndexs.length, recIndexs.length);
		const ref = this.luaApi.luaL_ref(this.address, LUA_REGISTRYINDEX);
		this.luaApi.lua_rawgeti(this.address, LUA_REGISTRYINDEX, ref);
		options.refs.set(object, ref);
		try {
			for (const key of arrIndexs) {
				this.pushValue(key, options);
				this.pushValue(object[key], options);
				this.luaApi.lua_settable(this.address, -3);
			}
			for (const key of recIndexs) {
				this.pushValue(key, options);
				this.pushValue(object[key], options);
				this.luaApi.lua_settable(this.address, -3);
			}
		} finally {
			const registerRefs = options.refs.values();
			for (const ref of registerRefs) this.luaApi.luaL_unref(this.address, LUA_REGISTRYINDEX, ref);
		}
	}
	getValue(index, options = {}) {
		index = this.luaApi.lua_absindex(this.address, index);
		const type = options.type ?? this.luaApi.lua_type(this.address, index);
		if (type === -1) return;
		else if (type === 0) return null;
		else if (type === 3) return this.luaApi.lua_tonumber(this.address, index);
		else if (type === 4) return this.luaApi.lua_tolstring(this.address, index, null);
		else if (type === 1) return Boolean(this.luaApi.lua_toboolean(this.address, index));
		else if (type === 8) return this.stateToThread(this.luaApi.lua_tothread(this.address, index));
		else if (type === 5) return this.getTable(index);
		else if (type === 6) return this.getFunction(index);
		else if (type === 7) {
			const userdata = this.luaApi.lua_touserdata(this.address, index);
			const ref = this.luaApi.module.getValue(userdata, "*");
			return this.luaApi.getRef(ref);
		}
	}
	getFunction(index) {
		this.luaApi.lua_pushvalue(this.address, index);
		const funcRef = this.luaApi.luaL_ref(this.address, LUA_REGISTRYINDEX);
		const pointer = this.luaApi.lua_topointer(this.address, index);
		if (this.luaApi.pointerRefs.has(pointer)) return this.luaApi.pointerRefs.get(pointer);
		const func = (...args) => {
			if (!func.$isAlive()) throw new Error("Tried to call a function that has been destroyed");
			if (this.isClosed()) {
				console.warn("Tried to call a function after closing lua state");
				return;
			}
			const thread = this.newThread();
			thread.luaApi.lua_rawgeti(thread.address, LUA_REGISTRYINDEX, funcRef);
			try {
				for (const arg of args) thread.pushValue(arg);
				const status = thread.luaApi.lua_pcall(thread.address, args.length, 1, 0);
				if (status === 1) throw new Error("cannot yield in callbacks from javascript");
				thread.assertOk(status);
				if (thread.getTop() > 0) return thread.getValue(-1);
				return;
			} finally {
				thread.close();
				this.pop();
			}
		};
		func.$isAlive = () => true;
		func.$destroy = () => {
			this.luaApi.luaL_unref(this.address, LUA_REGISTRYINDEX, funcRef);
			this.luaApi.pointerRefs.delete(pointer);
			func.$isAlive = () => false;
		};
		this.luaApi.pointerRefs.set(pointer, func);
		return func;
	}
	getTable(index) {
		return getTable(this, index);
	}
	stateToThread(L) {
		return L === this.parent?.address ? this.parent : new LuaThread(this.luaApi, L, this.parent || this);
	}
	pop(count = 1) {
		this.luaApi.lua_pop(this.address, count);
	}
	loadString(luaCode, name) {
		const size = this.luaApi.module.lengthBytesUTF8(luaCode);
		const pointerSize = size + 1;
		const bufferPointer = this.luaApi.module._malloc(pointerSize);
		try {
			this.luaApi.module.stringToUTF8(luaCode, bufferPointer, pointerSize);
			this.assertOk(this.luaApi.luaL_loadbuffer(this.address, bufferPointer, size, name ?? bufferPointer));
		} finally {
			this.luaApi.module._free(bufferPointer);
		}
	}
	loadFile(filename) {
		this.assertOk(this.luaApi.luaL_loadfilex(this.address, filename, null));
	}
	call(name, ...args) {
		const type = this.luaApi.lua_getglobal(this.address, name);
		if (type !== 6) throw new Error(`A function of type '${type}' was pushed, expected is 6`);
		for (const arg of args) this.pushValue(arg);
		const base = this.getTop() - args.length - 1;
		this.luaApi.lua_call(this.address, args.length, -1);
		return this.getStackValues(base);
	}
	getStackValues(start = 0) {
		const returns = this.getTop() - start;
		const returnValues = new MultiReturn(returns);
		for (let i = 0; i < returns; i++) returnValues[i] = this.getValue(start + i + 1);
		return returnValues;
	}
	async run(argCount = 0, options) {
		const originalTimeout = this.timeout;
		try {
			if (options?.timeout !== void 0) this.setTimeout(Date.now() + options.timeout);
			let resumeResult = this.resume(argCount);
			while (resumeResult.result === 1) {
				if (this.timeout && Date.now() > this.timeout) {
					if (resumeResult.resultCount > 0) this.pop(resumeResult.resultCount);
					throw new Error(`thread timeout exceeded`);
				}
				if (resumeResult.resultCount > 0) {
					const lastValue = this.getValue(-1);
					this.pop(resumeResult.resultCount);
					if (lastValue === Promise.resolve(lastValue)) await lastValue;
					else await new Promise((resolve) => setImmediate(resolve));
				} else await new Promise((resolve) => setImmediate(resolve));
				resumeResult = this.resume(0);
			}
			this.assertOk(resumeResult.result);
			return this.getStackValues();
		} finally {
			if (options?.timeout !== void 0) this.setTimeout(originalTimeout);
		}
	}
	runSync(argCount = 0) {
		const base = this.getTop() - argCount - 1;
		this.assertOk(this.luaApi.lua_pcall(this.address, argCount, -1, 0));
		return this.getStackValues(base);
	}
	isClosed() {
		return !this.address || this.closed || Boolean(this.parent?.isClosed());
	}
	close() {
		if (this.isClosed()) return;
		if (this.hookFunctionPointer) this.luaApi.module.removeFunction(this.hookFunctionPointer);
		this.closed = true;
	}
	resetThread() {
		this.luaApi.lua_close(this.address);
	}
	resume(argCount = 0) {
		return {
			result: this.luaApi.lua_resume(this.address, argCount),
			resultCount: this.getTop()
		};
	}
	setTimeout(timeout) {
		if (timeout && timeout > 0) {
			if (!this.hookFunctionPointer) this.hookFunctionPointer = this.luaApi.module.addFunction(() => {
				if (Date.now() > timeout) {
					this.pushValue(/* @__PURE__ */ new Error(`thread timeout exceeded`));
					this.luaApi.lua_error(this.address);
				}
			}, "vii");
			this.luaApi.lua_sethook(this.address, this.hookFunctionPointer, 8, INSTRUCTION_HOOK_COUNT);
			this.timeout = timeout;
		} else if (this.hookFunctionPointer) {
			this.hookFunctionPointer = void 0;
			this.timeout = void 0;
			this.luaApi.lua_sethook(this.address, null, 0, 0);
		}
	}
	getTimeout() {
		return this.timeout;
	}
	assertOk(result) {
		if (result !== 0 && result !== 1) {
			const resultString = LuaReturn[result];
			let error = /* @__PURE__ */ new Error(`Lua Error(${resultString}/${result})`);
			if (this.getTop() > 0) {
				if (result === 4) error.message = this.luaApi.lua_tolstring(this.address, -1, null);
				else {
					const luaError = this.getValue(-1);
					if (luaError instanceof Error) error = luaError;
					else error.message = this.indexToString(-1);
				}
			}
			if (result !== 4) {
				const pointer = this.luaApi.module._malloc(LuaDebug.structSize);
				try {
					let level = 0;
					const luaDebug = new LuaDebug(pointer, this.luaApi.module, error.message);
					while (this.luaApi.lua_getstack(this.address, level, pointer)) {
						this.luaApi.lua_getinfo(this.address, "nSlu", pointer);
						luaDebug.read();
						level++;
					}
					error.message = luaDebug.getMessage();
				} catch (err) {
					console.warn("Error in generate stack trace", err);
				} finally {
					this.luaApi.module._free(pointer);
				}
			}
			throw error;
		}
	}
	getGlobalPointer(name) {
		this.luaApi.lua_getglobal(this.address, name);
		const pointer = this.getPointer(-1);
		this.pop();
		return pointer;
	}
	getPointer(index) {
		return this.luaApi.lua_topointer(this.address, index);
	}
	indexToString(index) {
		const str = this.luaApi.luaL_tolstring(this.address, index);
		this.pop();
		return str;
	}
	dumpStack(log = console.log) {
		const top = this.getTop();
		for (let i = 1; i <= top; i++) {
			const typename = this.luaApi.luaL_typename(this.address, i);
			const pointer = this.getPointer(i).toString();
			const name = this.indexToString(i);
			log(i, typename, pointer, name);
		}
	}
	dumpTypes(log = console.log) {
		for (const type of this.types) log(type._name, type._priority);
	}
};
//#endregion
//#region src/global.ts
var LuaGlobal = class extends LuaThread {
	constructor(cmodule, shouldTraceAllocations) {
		if (shouldTraceAllocations) {
			const memoryStats = { memoryUsed: 0 };
			const allocatorFunctionPointer = cmodule.module.addFunction((_userData, pointer, oldSize, newSize) => {
				if (newSize === 0) {
					if (pointer) {
						memoryStats.memoryUsed -= oldSize;
						cmodule.module._free(pointer);
					}
					return 0;
				}
				const endMemoryDelta = pointer ? newSize - oldSize : newSize;
				const endMemory = memoryStats.memoryUsed + endMemoryDelta;
				if (newSize > oldSize && memoryStats.memoryMax && endMemory > memoryStats.memoryMax) return 0;
				const reallocated = cmodule.module._realloc(pointer, newSize);
				if (reallocated) memoryStats.memoryUsed = endMemory;
				return reallocated;
			}, "iiiii");
			const address = cmodule.lua_newstate(allocatorFunctionPointer, null);
			if (!address) {
				cmodule.module.removeFunction(allocatorFunctionPointer);
				throw new Error("lua_newstate returned a null pointer");
			}
			super(cmodule, address);
			this.memoryStats = memoryStats;
			this.allocatorFunctionPointer = allocatorFunctionPointer;
		} else {
			const address = cmodule.luaL_newstate();
			super(cmodule, address);
		}
		if (this.isClosed()) throw new Error("Global state could not be created (probably due to lack of memory)");
	}
	close() {
		if (this.isClosed()) return;
		super.close();
		this.luaApi.lua_close(this.address);
		if (this.allocatorFunctionPointer) this.luaApi.module.removeFunction(this.allocatorFunctionPointer);
	}
	loadLibrary(library) {
		switch (library) {
			case "_G":
				this.luaApi.luaopen_base(this.address);
				break;
			case "table":
				this.luaApi.luaopen_table(this.address);
				break;
			case "io":
				this.luaApi.luaopen_io(this.address);
				break;
			case "os":
				this.luaApi.luaopen_os(this.address);
				break;
			case "string":
				this.luaApi.luaopen_string(this.address);
				break;
			case "math":
				this.luaApi.luaopen_math(this.address);
				break;
			case "debug":
				this.luaApi.luaopen_debug(this.address);
				break;
			case "package": this.luaApi.luaopen_package(this.address);
		}
		this.luaApi.lua_setglobal(this.address, library);
	}
	get(name) {
		const type = this.luaApi.lua_getglobal(this.address, name);
		const value = this.getValue(-1, { type });
		this.pop();
		return value;
	}
	set(name, value, options) {
		this.pushValue(value, options);
		this.luaApi.lua_setglobal(this.address, name);
	}
	getMemoryUsed() {
		return this.getMemoryStatsRef().memoryUsed;
	}
	getMemoryMax() {
		return this.getMemoryStatsRef().memoryMax;
	}
	setMemoryMax(max) {
		this.getMemoryStatsRef().memoryMax = max;
	}
	getMemoryStatsRef() {
		if (!this.memoryStats) throw new Error("Memory allocations is not being traced, please build engine with { traceAllocations: true }");
		return this.memoryStats;
	}
};
//#endregion
//#region build/liblua5.1.js
async function initWasmModule(moduleArg = {}) {
	var Module = moduleArg;
	(function() {
		function a(d) {
			d = d.split("-")[0];
			for (d = d.split(".").slice(0, 3); d.length < 3;) d.push("00");
			d = d.map((f) => f.padStart(2, "0"));
			return d.join("");
		}
		if (typeof process !== "undefined" && !process.versions?.Oa && typeof Deno == "undefined") {
			var b = process.versions?.node ? a(process.versions.node) : 2147483647;
			if (b < 180300) throw Error(`This emscripten-generated code requires node v18.3.0 (detected v${[
				b / 1e4 | 0,
				(b / 100 | 0) % 100,
				b % 100
			].join(".")})`);
		}
		if (b = typeof navigator !== "undefined" && navigator.userAgent) {
			var c = b.includes("Safari/") && !b.includes("Chrome/") && b.match(/Version\/(\d+\.?\d*\.?\d*)/) ? a(b.match(/Version\/(\d+\.?\d*\.?\d*)/)[1]) : 2147483647;
			if (c < 15e4) throw Error(`This emscripten-generated code requires Safari v15.0.0 (detected v${c})`);
			c = b.match(/Firefox\/(\d+(?:\.\d+)?)/) ? parseFloat(b.match(/Firefox\/(\d+(?:\.\d+)?)/)[1]) : 2147483647;
			if (c < 79) throw Error(`This emscripten-generated code requires Firefox v79 (detected v${c})`);
			b = b.match(/Chrome\/(\d+(?:\.\d+)?)/) ? parseFloat(b.match(/Chrome\/(\d+(?:\.\d+)?)/)[1]) : 2147483647;
			if (b < 85) throw Error(`This emscripten-generated code requires Chrome v85 (detected v${b})`);
		}
	})();
	var aa = !!globalThis.window, da = !!globalThis.WorkerGlobalScope, e = globalThis.process?.versions?.node && globalThis.process?.type != "renderer", ea = !aa && !e && !da;
	if (e) {
		let { createRequire: a } = await import("node:module");
		var fa = a(import.meta.url);
	}
	var ha = "./this.program", ia = (a, b) => {
		throw b;
	}, ja = import.meta.url, ka = "", la, ma;
	if (e) {
		if (!globalThis.process?.versions?.node || globalThis.process?.type == "renderer") throw Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");
		var oa = fa("node:fs");
		ja.startsWith("file:") && (ka = fa("node:path").dirname(fa("node:url").fileURLToPath(ja)) + "/");
		ma = (a) => {
			a = pa(a) ? new URL(a) : a;
			a = oa.readFileSync(a);
			g(Buffer.isBuffer(a));
			return a;
		};
		la = async (a) => {
			a = pa(a) ? new URL(a) : a;
			a = oa.readFileSync(a, void 0);
			g(Buffer.isBuffer(a));
			return a;
		};
		process.argv.length > 1 && (ha = process.argv[1].replace(/\\/g, "/"));
		process.argv.slice(2);
		ia = (a, b) => {
			process.exitCode = a;
			throw b;
		};
	} else if (!ea) if (aa || da) {
		try {
			ka = new URL(".", ja).href;
		} catch {}
		if (!globalThis.window && !globalThis.WorkerGlobalScope) throw Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");
		da && (ma = (a) => {
			var b = new XMLHttpRequest();
			b.open("GET", a, !1);
			b.responseType = "arraybuffer";
			b.send(null);
			return new Uint8Array(b.response);
		});
		la = async (a) => {
			if (pa(a)) return new Promise((c, d) => {
				var f = new XMLHttpRequest();
				f.open("GET", a, !0);
				f.responseType = "arraybuffer";
				f.onload = () => {
					f.status == 200 || f.status == 0 && f.response ? c(f.response) : d(f.status);
				};
				f.onerror = d;
				f.send(null);
			});
			var b = await fetch(a, { credentials: "same-origin" });
			if (b.ok) return b.arrayBuffer();
			throw Error(b.status + " : " + b.url);
		};
	} else throw Error("environment detection error");
	var k = console.log.bind(console), l = console.error.bind(console);
	g(!ea, "shell environment detected but not enabled at build time (add `shell` to `-sENVIRONMENT` to enable)");
	globalThis.WebAssembly || l("no native wasm support detected");
	var qa = !1;
	function g(a, b) {
		a || r("Assertion failed" + (b ? ": " + b : ""));
	}
	var pa = (a) => a.startsWith("file://");
	class ra {}
	class sa extends ra {}
	var ta = /* @__PURE__ */ new Int16Array(1), ua = new Int8Array(ta.buffer);
	ta[0] = 25459;
	ua[0] === 115 && ua[1] === 99 || r("Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)");
	function va() {
		var a = Module.preRun;
		Array.isArray(a) && (a = new Proxy(a, {
			set() {
				r("Attempt to modify `Module.preRun` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'");
				return !1;
			},
			defineProperty() {
				r("Attempt to modify `Module.preRun` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'");
				return !1;
			},
			deleteProperty() {
				r("Attempt to modify `Module.preRun` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'");
				return !1;
			}
		}));
		Object.defineProperty(Module, "preRun", {
			configurable: !0,
			get() {
				return a;
			},
			set() {
				r("Attempt to modify `Module.preRun` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'");
			}
		});
	}
	function u(a) {
		return () => g(!1, `call to '${a}' via reference taken before Wasm module initialization`);
	}
	function v(a) {
		Object.getOwnPropertyDescriptor(Module, a) && r(`\`Module.${a}\` was supplied but \`${a}\` not included in INCOMING_MODULE_JS_API`);
	}
	function wa(a) {
		Object.getOwnPropertyDescriptor(Module, a) || Object.defineProperty(Module, a, {
			configurable: !0,
			get() {
				var b = `'${a}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
				a !== "FS_createPath" && a !== "FS_createDataFile" && a !== "FS_createPreloadedFile" && a !== "FS_preloadFile" && a !== "FS_unlink" && a !== "addRunDependency" && a !== "FS_createLazyFile" && a !== "FS_createDevice" && a !== "removeRunDependency" || (b += ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you");
				r(b);
			}
		});
	}
	function xa(a) {
		return "0x" + (a >>> 0).toString(16).padStart(8, "0");
	}
	function ya() {
		if (!qa) {
			var a = za();
			a == 0 && (a += 4);
			var b = x[a >> 2], c = x[a + 4 >> 2];
			b == 34821223 && c == 2310721022 || r(`Stack overflow! Stack cookie has been overwritten at ${Aa(a)}, expected hex dwords ${xa(2310721022)} and ${xa(34821223)}, but received ${xa(c)} ${xa(b)}`);
			x[0] != 1668509029 && r("Runtime error: The application has corrupted its heap memory area (address zero)!");
		}
	}
	var Ba = !1;
	function Ca() {
		if (!y?.buffer?.resizable) {
			var a = Da.buffer;
			y = new Int8Array(a);
			z = new Int16Array(a);
			Ea = new Uint8Array(a);
			A = new Int32Array(a);
			Module.HEAPU32 = x = new Uint32Array(a);
			Fa = new Float32Array(a);
			Ga = new Float64Array(a);
			Ha = new BigInt64Array(a);
		}
	}
	g(globalThis.Int32Array && globalThis.Float64Array && Int32Array.prototype.subarray && Int32Array.prototype.set, "JS engine does not provide full typed array support");
	function r(a) {
		a = `Aborted(${a})`;
		l(a);
		qa = !0;
		throw new WebAssembly.RuntimeError(a);
	}
	function C(a, b, c) {
		g(b);
		return (...d) => {
			g(Ba, `native function \`${a}\` called before runtime initialization`);
			g(d.length <= c, `native function \`${a}\` called with ${d.length} args but expects ${c}`);
			return b(...d);
		};
	}
	var Ia;
	async function Ja(a) {
		try {
			var b = await la(a);
			return new Uint8Array(b);
		} catch {}
		if (ma) a = ma(a);
		else throw "both async and sync fetching of the wasm failed";
		return a;
	}
	async function Ka(a, b) {
		try {
			var c = await Ja(a);
			return await WebAssembly.instantiate(c, b);
		} catch (d) {
			l(`failed to asynchronously prepare wasm: ${d}`), pa(a) && l(`warning: Loading from a file URI (${a}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`), r(d);
		}
	}
	async function La(a) {
		var b = Ia;
		if (!pa(b) && !e) try {
			var c = fetch(b, { credentials: "same-origin" });
			return await WebAssembly.instantiateStreaming(c, a);
		} catch (d) {
			l(`wasm streaming compile failed: ${d}`), l("falling back to ArrayBuffer instantiation");
		}
		return Ka(b, a);
	}
	class Ma {
		name = "ExitStatus";
		constructor(a) {
			this.message = `Program terminated with exit(${a})`;
			this.status = a;
		}
	}
	var A, y, x, Na = [];
	function Aa(a) {
		g(typeof a === "number", `ptrToString expects a number, got ${typeof a}`);
		return "0x" + (a >>> 0).toString(16).padStart(8, "0");
	}
	var E = (a) => {
		E.da || (E.da = {});
		E.da[a] || (E.da[a] = 1, e && (a = "warning: " + a), l(a));
	}, Oa = globalThis.TextDecoder && new TextDecoder(), H = (a, b = 0, c, d) => {
		var f = b;
		c = f + c;
		if (d) d = c;
		else {
			for (; a[f] && !(f >= c);) ++f;
			d = f;
		}
		if (d - b > 16 && a.buffer && Oa) return Oa.decode(a.subarray(b, d));
		for (f = ""; b < d;) if (c = a[b++], c & 128) {
			var h = a[b++] & 63;
			if ((c & 224) == 192) f += String.fromCharCode((c & 31) << 6 | h);
			else {
				var m = a[b++] & 63;
				(c & 240) == 224 ? c = (c & 15) << 12 | h << 6 | m : ((c & 248) != 240 && E(`Invalid UTF-8 leading byte ${Aa(c)} encountered when deserializing a UTF-8 string in wasm memory to a JS string!`), c = (c & 7) << 18 | h << 12 | m << 6 | a[b++] & 63);
				c < 65536 ? f += String.fromCharCode(c) : (c -= 65536, f += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023));
			}
		} else f += String.fromCharCode(c);
		return f;
	}, Ea, I = (a, b, c) => {
		g(typeof a == "number", `UTF8ToString expects a number (got ${typeof a})`);
		return a ? H(Ea, a, b, c) : "";
	}, Pa = (a, b) => {
		for (var c = 0, d = a.length - 1; d >= 0; d--) {
			var f = a[d];
			f === "." ? a.splice(d, 1) : f === ".." ? (a.splice(d, 1), c++) : c && (a.splice(d, 1), c--);
		}
		if (b) for (; c; c--) a.unshift("..");
		return a;
	}, K = (a) => {
		var b = a.charAt(0) === "/", c = a.slice(-1) === "/";
		(a = Pa(a.split("/").filter((d) => !!d), !b).join("/")) || b || (a = ".");
		a && c && (a += "/");
		return (b ? "/" : "") + a;
	}, Qa = (a) => {
		var b = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1);
		a = b[0];
		b = b[1];
		if (!a && !b) return ".";
		b &&= b.slice(0, -1);
		return a + b;
	}, L = (a) => a && a.match(/([^\/]+|\/)\/*$/)[1], Ra = () => {
		if (e) {
			var a = fa("node:crypto");
			return (b) => (a.randomFillSync(b), 0);
		}
		return (b) => (crypto.getRandomValues(b), 0);
	}, Sa = (a) => (Sa = Ra())(a), Ta = (...a) => {
		for (var b = "", c = !1, d = a.length - 1; d >= -1 && !c; d--) {
			c = d >= 0 ? a[d] : M.cwd();
			if (typeof c != "string") throw new TypeError("Arguments to path.resolve must be strings");
			if (!c) return "";
			b = c + "/" + b;
			c = c.charAt(0) === "/";
		}
		b = Pa(b.split("/").filter((f) => !!f), !c).join("/");
		return (c ? "/" : "") + b || ".";
	}, Ua = (a, b) => {
		function c(m) {
			for (var n = 0; n < m.length && m[n] === ""; n++);
			for (var w = m.length - 1; w >= 0 && m[w] === ""; w--);
			return n > w ? [] : m.slice(n, w - n + 1);
		}
		a = Ta(a).slice(1);
		b = Ta(b).slice(1);
		a = c(a.split("/"));
		b = c(b.split("/"));
		for (var d = Math.min(a.length, b.length), f = d, h = 0; h < d; h++) if (a[h] !== b[h]) {
			f = h;
			break;
		}
		d = [];
		for (h = f; h < a.length; h++) d.push("..");
		d = d.concat(b.slice(f));
		return d.join("/");
	}, Va = [], N = (a) => {
		for (var b = 0, c = 0; c < a.length; ++c) {
			var d = a.charCodeAt(c);
			d <= 127 ? b++ : d <= 2047 ? b += 2 : d >= 55296 && d <= 57343 ? (b += 4, ++c) : b += 3;
		}
		return b;
	}, Wa = (a, b, c, d) => {
		g(typeof a === "string", `stringToUTF8Array expects a string (got ${typeof a})`);
		if (!(d > 0)) return 0;
		var f = c;
		d = c + d - 1;
		for (var h = 0; h < a.length; ++h) {
			var m = a.codePointAt(h);
			if (m <= 127) {
				if (c >= d) break;
				b[c++] = m;
			} else if (m <= 2047) {
				if (c + 1 >= d) break;
				b[c++] = 192 | m >> 6;
				b[c++] = 128 | m & 63;
			} else if (m <= 65535) {
				if (c + 2 >= d) break;
				b[c++] = 224 | m >> 12;
				b[c++] = 128 | m >> 6 & 63;
				b[c++] = 128 | m & 63;
			} else {
				if (c + 3 >= d) break;
				m > 1114111 && E(`Invalid Unicode code point ${Aa(m)} encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).`);
				b[c++] = 240 | m >> 18;
				b[c++] = 128 | m >> 12 & 63;
				b[c++] = 128 | m >> 6 & 63;
				b[c++] = 128 | m & 63;
				h++;
			}
		}
		b[c] = 0;
		return c - f;
	}, Xa = (a) => {
		var b = Array(N(a) + 1);
		a = Wa(a, b, 0, b.length);
		b.length = a;
		return b;
	}, Ya = [];
	function Za(a, b) {
		Ya[a] = {
			input: [],
			output: [],
			J: b
		};
		$a(a, ab);
	}
	var ab = {
		open(a) {
			var b = Ya[a.node.rdev];
			if (!b) throw new M.g(43);
			a.tty = b;
			a.seekable = !1;
		},
		close(a) {
			a.tty.J.fsync(a.tty);
		},
		fsync(a) {
			a.tty.J.fsync(a.tty);
		},
		read(a, b, c, d) {
			if (!a.tty || !a.tty.J.ja) throw new M.g(60);
			for (var f = 0, h = 0; h < d; h++) {
				try {
					var m = a.tty.J.ja(a.tty);
				} catch (n) {
					throw new M.g(29);
				}
				if (m === void 0 && !f) throw new M.g(6);
				if (m === null || m === void 0) break;
				f++;
				b[c + h] = m;
				if (m === 10) break;
			}
			f && (a.node.atime = Date.now());
			return f;
		},
		write(a, b, c, d) {
			if (!a.tty || !a.tty.J.ba) throw new M.g(60);
			try {
				for (var f = 0; f < d; f++) a.tty.J.ba(a.tty, b[c + f]);
			} catch (h) {
				throw new M.g(29);
			}
			d && (a.node.mtime = a.node.ctime = Date.now());
			return f;
		}
	}, bb = {
		ja() {
			a: {
				if (!Va.length) {
					var a = null;
					if (e) {
						var b = Buffer.alloc(256), c = 0;
						try {
							c = oa.readSync(process.stdin.fd, b, 0, 256);
						} catch (d) {
							if (d.toString().includes("EOF")) c = 0;
							else throw d;
						}
						c > 0 && (a = b.toString("utf-8", 0, c));
					} else globalThis.window?.prompt && (a = window.prompt("Input: "), a !== null && (a += "\n"));
					if (!a) {
						a = null;
						break a;
					}
					Va = Xa(a);
				}
				a = Va.shift();
			}
			return a;
		},
		ba(a, b) {
			b === null || b === 10 ? (k(H(a.output)), a.output = []) : b != 0 && a.output.push(b);
		},
		fsync(a) {
			a.output?.length > 0 && (k(H(a.output)), a.output = []);
		},
		Aa() {
			return {
				Ra: 25856,
				Ta: 5,
				Qa: 191,
				Sa: 35387,
				Pa: [
					3,
					28,
					127,
					21,
					4,
					0,
					1,
					0,
					17,
					19,
					26,
					0,
					18,
					15,
					23,
					22,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			};
		},
		Ba() {
			return 0;
		},
		Ca() {
			return [24, 80];
		}
	}, cb = {
		ba(a, b) {
			b === null || b === 10 ? (l(H(a.output)), a.output = []) : b != 0 && a.output.push(b);
		},
		fsync(a) {
			a.output?.length > 0 && (l(H(a.output)), a.output = []);
		}
	}, db = () => {
		r("internal error: mmapAlloc called but `emscripten_builtin_memalign` native symbol not exported");
	}, O = {
		D: null,
		o() {
			return O.createNode(null, "/", 16895, 0);
		},
		createNode(a, b, c, d) {
			if ((c & 61440) === 24576 || M.isFIFO(c)) throw new M.g(63);
			O.D || (O.D = {
				dir: {
					node: {
						B: O.h.B,
						F: O.h.F,
						lookup: O.h.lookup,
						H: O.h.H,
						rename: O.h.rename,
						unlink: O.h.unlink,
						rmdir: O.h.rmdir,
						readdir: O.h.readdir,
						symlink: O.h.symlink
					},
					stream: { A: O.l.A }
				},
				file: {
					node: {
						B: O.h.B,
						F: O.h.F
					},
					stream: {
						A: O.l.A,
						read: O.l.read,
						write: O.l.write,
						O: O.l.O,
						R: O.l.R
					}
				},
				link: {
					node: {
						B: O.h.B,
						F: O.h.F,
						readlink: O.h.readlink
					},
					stream: {}
				},
				fa: {
					node: {
						B: O.h.B,
						F: O.h.F
					},
					stream: M.va
				}
			});
			c = M.createNode(a, b, c, d);
			P(c.mode) ? (c.h = O.D.dir.node, c.l = O.D.dir.stream, c.m = {}) : M.isFile(c.mode) ? (c.h = O.D.file.node, c.l = O.D.file.stream, c.v = 0, c.m = O.wa ?? (O.wa = /* @__PURE__ */ new Uint8Array(0))) : (c.mode & 61440) === 40960 ? (c.h = O.D.link.node, c.l = O.D.link.stream) : (c.mode & 61440) === 8192 && (c.h = O.D.fa.node, c.l = O.D.fa.stream);
			c.atime = c.mtime = c.ctime = Date.now();
			a && (a.m[b] = c, a.atime = a.mtime = a.ctime = c.atime);
			return c;
		},
		h: {
			B(a) {
				var b = {};
				b.dev = (a.mode & 61440) === 8192 ? a.id : 1;
				b.ino = a.id;
				b.mode = a.mode;
				b.nlink = 1;
				b.uid = 0;
				b.gid = 0;
				b.rdev = a.rdev;
				P(a.mode) ? b.size = 4096 : M.isFile(a.mode) ? b.size = a.v : (a.mode & 61440) === 40960 ? b.size = a.link.length : b.size = 0;
				b.atime = new Date(a.atime);
				b.mtime = new Date(a.mtime);
				b.ctime = new Date(a.ctime);
				b.blksize = 4096;
				b.blocks = Math.ceil(b.size / b.blksize);
				return b;
			},
			F(a, b) {
				for (var c of [
					"mode",
					"atime",
					"mtime",
					"ctime"
				]) b[c] != null && (a[c] = b[c]);
				b.size !== void 0 && (b = b.size, a.v != b && (c = a.m, a.m = new Uint8Array(b), a.m.set(c.subarray(0, Math.min(b, a.v))), a.v = b));
			},
			lookup() {
				throw new M.g(44);
			},
			H(a, b, c, d) {
				return O.createNode(a, b, c, d);
			},
			rename(a, b, c) {
				try {
					var d = Q(b, c);
				} catch (h) {}
				if (d) {
					if (P(a.mode)) for (var f in d.m) throw new M.g(55);
					eb(d);
				}
				delete a.parent.m[a.name];
				b.m[c] = a;
				a.name = c;
				b.ctime = b.mtime = a.parent.ctime = a.parent.mtime = Date.now();
			},
			unlink(a, b) {
				delete a.m[b];
				a.ctime = a.mtime = Date.now();
			},
			rmdir(a, b) {
				var c = Q(a, b), d;
				for (d in c.m) throw new M.g(55);
				delete a.m[b];
				a.ctime = a.mtime = Date.now();
			},
			readdir(a) {
				return [
					".",
					"..",
					...Object.keys(a.m)
				];
			},
			symlink(a, b, c) {
				a = O.createNode(a, b, 41471, 0);
				a.link = c;
				return a;
			},
			readlink(a) {
				if ((a.mode & 61440) !== 40960) throw new M.g(28);
				return a.link;
			}
		},
		l: {
			read(a, b, c, d, f) {
				var h = a.node.m;
				if (f >= a.node.v) return 0;
				a = Math.min(a.node.v - f, d);
				g(a >= 0);
				b.set(h.subarray(f, f + a), c);
				return a;
			},
			write(a, b, c, d, f, h) {
				g(b.subarray, "FS.write expects a TypedArray");
				b.buffer === y.buffer && (h = !1);
				if (!d) return 0;
				a = a.node;
				a.mtime = a.ctime = Date.now();
				if (h) g(!f, "canOwn must imply no weird position inside the file"), a.m = b.subarray(c, c + d), a.v = d;
				else if (a.v || f) {
					h = f + d;
					var m = a.m.length;
					m >= h || (h = Math.max(h, m * (m < 1048576 ? 2 : 1.125) >>> 0), m && (h = Math.max(h, 256)), g(M.isFile(a.mode), "getFileDataAsTypedArray called on non-file"), m = a.m.subarray(0, a.v), a.m = new Uint8Array(h), a.m.set(m));
					a.m.set(b.subarray(c, c + d), f);
					a.v = Math.max(a.v, f + d);
				} else a.m = b.slice(c, c + d), a.v = d;
				return d;
			},
			A(a, b, c) {
				c === 1 ? b += a.position : c === 2 && M.isFile(a.node.mode) && (b += a.node.v);
				if (b < 0) throw new M.g(28);
				return b;
			},
			O(a, b, c, d, f) {
				if (!M.isFile(a.node.mode)) throw new M.g(43);
				a = a.node.m;
				if (f & 2 || a.buffer !== y.buffer) {
					d = !0;
					f = db();
					if (!f) throw new M.g(48);
					if (a) {
						if (c > 0 || c + b < a.length) a.subarray ? a = a.subarray(c, c + b) : a = Array.prototype.slice.call(a, c, c + b);
						y.set(a, f);
					}
				} else d = !1, f = a.byteOffset;
				return {
					Ia: f,
					ta: d
				};
			},
			R(a, b, c, d) {
				O.l.write(a, b, 0, d, c, !1);
				return 0;
			}
		}
	}, fb = (a) => {
		typeof a == "string" && (a = Xa(a));
		a.subarray || (a = new Uint8Array(a));
		return a;
	}, gb = (a, b) => {
		var c = 0;
		a && (c |= 365);
		b && (c |= 146);
		return c;
	}, hb = {
		EPERM: 63,
		ENOENT: 44,
		ESRCH: 71,
		EINTR: 27,
		EIO: 29,
		ENXIO: 60,
		E2BIG: 1,
		ENOEXEC: 45,
		EBADF: 8,
		ECHILD: 12,
		EAGAIN: 6,
		EWOULDBLOCK: 6,
		ENOMEM: 48,
		EACCES: 2,
		EFAULT: 21,
		ENOTBLK: 105,
		EBUSY: 10,
		EEXIST: 20,
		EXDEV: 75,
		ENODEV: 43,
		ENOTDIR: 54,
		EISDIR: 31,
		EINVAL: 28,
		ENFILE: 41,
		EMFILE: 33,
		ENOTTY: 59,
		ETXTBSY: 74,
		EFBIG: 22,
		ENOSPC: 51,
		ESPIPE: 70,
		EROFS: 69,
		EMLINK: 34,
		EPIPE: 64,
		EDOM: 18,
		ERANGE: 68,
		ENOMSG: 49,
		EIDRM: 24,
		ECHRNG: 106,
		EL2NSYNC: 156,
		EL3HLT: 107,
		EL3RST: 108,
		ELNRNG: 109,
		EUNATCH: 110,
		ENOCSI: 111,
		EL2HLT: 112,
		EDEADLK: 16,
		ENOLCK: 46,
		EBADE: 113,
		EBADR: 114,
		EXFULL: 115,
		ENOANO: 104,
		EBADRQC: 103,
		EBADSLT: 102,
		EDEADLOCK: 16,
		EBFONT: 101,
		ENOSTR: 100,
		ENODATA: 116,
		ETIME: 117,
		ENOSR: 118,
		ENONET: 119,
		ENOPKG: 120,
		EREMOTE: 121,
		ENOLINK: 47,
		EADV: 122,
		ESRMNT: 123,
		ECOMM: 124,
		EPROTO: 65,
		EMULTIHOP: 36,
		EDOTDOT: 125,
		EBADMSG: 9,
		ENOTUNIQ: 126,
		EBADFD: 127,
		EREMCHG: 128,
		ELIBACC: 129,
		ELIBBAD: 130,
		ELIBSCN: 131,
		ELIBMAX: 132,
		ELIBEXEC: 133,
		ENOSYS: 52,
		ENOTEMPTY: 55,
		ENAMETOOLONG: 37,
		ELOOP: 32,
		EOPNOTSUPP: 138,
		EPFNOSUPPORT: 139,
		ECONNRESET: 15,
		ENOBUFS: 42,
		EAFNOSUPPORT: 5,
		EPROTOTYPE: 67,
		ENOTSOCK: 57,
		ENOPROTOOPT: 50,
		ESHUTDOWN: 140,
		ECONNREFUSED: 14,
		EADDRINUSE: 3,
		ECONNABORTED: 13,
		ENETUNREACH: 40,
		ENETDOWN: 38,
		ETIMEDOUT: 73,
		EHOSTDOWN: 142,
		EHOSTUNREACH: 23,
		EINPROGRESS: 26,
		EALREADY: 7,
		EDESTADDRREQ: 17,
		EMSGSIZE: 35,
		EPROTONOSUPPORT: 66,
		ESOCKTNOSUPPORT: 137,
		EADDRNOTAVAIL: 4,
		ENETRESET: 39,
		EISCONN: 30,
		ENOTCONN: 53,
		ETOOMANYREFS: 141,
		EUSERS: 136,
		EDQUOT: 19,
		ESTALE: 72,
		ENOTSUP: 138,
		ENOMEDIUM: 148,
		EILSEQ: 25,
		EOVERFLOW: 61,
		ECANCELED: 11,
		ENOTRECOVERABLE: 56,
		EOWNERDEAD: 62,
		ESTRPIPE: 135
	}, ib = async (a) => {
		var b = await la(a);
		g(b, `Loading data file "${a}" failed (no arrayBuffer).`);
		return new Uint8Array(b);
	}, jb = null, kb = async () => jb, lb = 0, mb = null, R = {}, S = null, nb = (a) => {
		lb || (jb = new Promise((b) => mb = b));
		lb++;
		g(a, "addRunDependency requires an ID");
		g(!R[a]);
		R[a] = 1;
		!S && globalThis.setInterval && (S = setInterval(() => {
			if (qa) clearInterval(S), S = null;
			else {
				var b = !1, c;
				for (c in R) b || (b = !0, l("still waiting on run dependencies:")), l(`dependency: ${c}`);
				b && l("(end of list)");
			}
		}, 1e4), S.unref?.());
	}, ob = [], pb = async (a, b) => {
		typeof Browser != "undefined" && Browser.init();
		for (var c of ob) if (c.canHandle(b)) return g(c.handle.constructor.name === "AsyncFunction", "Filesystem plugin handlers must be async functions (See #24914)"), c.handle(a, b);
		return a;
	}, rb = async (a, b, c, d, f, h, m, n) => {
		var w = b ? Ta(K(a + "/" + b)) : a, q;
		a: {
			for (var p = q = `cp ${w}`;;) {
				if (!R[q]) break a;
				q = p + Math.random();
			}
			q = void 0;
		}
		nb(q);
		try {
			if (p = c, typeof c == "string" && (p = await ib(c)), p = await pb(p, w), n?.(), !h) {
				c = p;
				h = b;
				a && (a = typeof a == "string" ? a : qb(a), h = b ? K(a + "/" + b) : a);
				var t = gb(d, f), B = M.create(h, t);
				if (c) {
					c = fb(c);
					M.chmod(B, t | 146);
					var D = M.open(B, 577);
					M.write(D, c, 0, c.length, 0, m);
					M.close(D);
					M.chmod(B, t);
				}
			}
		} finally {
			b = q, lb--, g(b, "removeRunDependency requires an ID"), g(R[b]), delete R[b], lb || (S !== null && (clearInterval(S), S = null), mb());
		}
	};
	function $a(a, b) {
		M.ha[a] = { l: b };
	}
	function P(a) {
		return (a & 61440) === 16384;
	}
	function Q(a, b) {
		var c = P(a.mode) ? (c = T(a, "x")) ? c : a.h.lookup ? 0 : 2 : 54;
		if (c) throw new M.g(c);
		for (c = M.I[sb(a.id, b)]; c; c = c.N) {
			var d = c.name;
			if (c.parent.id === a.id && d === b) return c;
		}
		return M.lookup(a, b);
	}
	function eb(a) {
		var b = sb(a.parent.id, a.name);
		if (M.I[b] === a) M.I[b] = a.N;
		else for (b = M.I[b]; b;) {
			if (b.N === a) {
				b.N = a.N;
				break;
			}
			b = b.N;
		}
	}
	function U(a, b = {}) {
		if (!a) throw new M.g(44);
		b.T ?? (b.T = !0);
		a.charAt(0) === "/" || (a = M.cwd() + "/" + a);
		var c = 0;
		a: for (; c < 40; c++) {
			a = a.split("/").filter((n) => !!n);
			for (var d = M.root, f = "/", h = 0; h < a.length; h++) {
				var m = h === a.length - 1;
				if (m && b.parent) break;
				if (a[h] !== ".") if (a[h] === "..") if (f = Qa(f), d === d.parent) {
					a = f + "/" + a.slice(h + 1).join("/");
					c--;
					continue a;
				} else d = d.parent;
				else {
					f = K(f + "/" + a[h]);
					try {
						d = Q(d, a[h]);
					} catch (n) {
						if (n?.u === 44 && m && b.Fa) return { path: f };
						throw n;
					}
					!d.C || m && !b.T || (d = d.C.root);
					if ((d.mode & 61440) === 40960 && (!m || b.G)) {
						if (!d.h.readlink) throw new M.g(52);
						d = d.h.readlink(d);
						d.charAt(0) === "/" || (d = Qa(f) + "/" + d);
						a = d + "/" + a.slice(h + 1).join("/");
						continue a;
					}
				}
			}
			return {
				path: f,
				node: d
			};
		}
		throw new M.g(32);
	}
	function qb(a) {
		for (var b;;) {
			if (a === a.parent) return a = a.o.ma, b ? a[a.length - 1] !== "/" ? `${a}/${b}` : a + b : a;
			b = b ? `${a.name}/${b}` : a.name;
			a = a.parent;
		}
	}
	function sb(a, b) {
		for (var c = 0, d = 0; d < b.length; d++) c = (c << 5) - c + b.charCodeAt(d) | 0;
		return (a + c >>> 0) % M.I.length;
	}
	function tb(a) {
		var b = sb(a.parent.id, a.name);
		a.N = M.I[b];
		M.I[b] = a;
	}
	function T(a, b) {
		return M.ka ? 0 : b.includes("r") && !(a.mode & 292) || b.includes("w") && !(a.mode & 146) || b.includes("x") && !(a.mode & 73) ? 2 : 0;
	}
	function ub(a, b) {
		if (!P(a.mode)) return 54;
		try {
			return Q(a, b), 20;
		} catch (c) {}
		return T(a, "wx");
	}
	function vb(a, b, c) {
		try {
			var d = Q(a, b);
		} catch (f) {
			return f.u;
		}
		if (a = T(a, "wx")) return a;
		if (c) {
			if (!P(d.mode)) return 54;
			if (d === d.parent || qb(d) === M.cwd()) return 10;
		} else if (P(d.mode)) return 31;
		return 0;
	}
	function wb(a, b) {
		if (!a) throw new M.g(b);
		return a;
	}
	function V(a) {
		a = M.ia(a);
		if (!a) throw new M.g(8);
		return a;
	}
	function xb(a, b = -1) {
		g(b >= -1);
		a = Object.assign(new M.sa(), a);
		if (b == -1) a: {
			for (b = 0; b <= M.ea; b++) if (!M.streams[b]) break a;
			throw new M.g(33);
		}
		a.fd = b;
		return M.streams[b] = a;
	}
	function yb(a, b = -1) {
		a = xb(a, b);
		a.l?.Ya?.(a);
		return a;
	}
	function zb(a, b, c) {
		var d = a?.l.F;
		a = d ? a : b;
		d ??= b.h.F;
		wb(d, 63);
		try {
			d(a, c);
		} catch (f) {
			if (f instanceof RangeError) throw new M.g(22);
			throw f;
		}
	}
	function Ab(a) {
		var b = [];
		for (a = [a]; a.length;) {
			var c = a.pop();
			b.push(c);
			a.push(...c.P);
		}
		return b;
	}
	function Bb(a) {
		var b = {
			Na: 4096,
			$a: 4096,
			blocks: 1e6,
			Ma: 5e5,
			La: 5e5,
			files: M.aa,
			Za: M.aa - 1,
			ab: 42,
			flags: 2,
			fb: 255
		};
		a.h.oa && Object.assign(b, a.h.oa(a.o.Ha.root));
		return b;
	}
	function Cb(a, b, c) {
		typeof c == "undefined" && (c = b, b = 438);
		return M.H(a, b | 8192, c);
	}
	function Db(a, b, c, d) {
		zb(a, b, {
			mode: c & 4095 | b.mode & -4096,
			ctime: Date.now(),
			V: d
		});
	}
	function Eb(a, b, c) {
		if (P(b.mode)) throw new M.g(31);
		if (!M.isFile(b.mode)) throw new M.g(28);
		var d = T(b, "w");
		if (d) throw new M.g(d);
		zb(a, b, {
			size: c,
			timestamp: Date.now()
		});
	}
	function Fb(a, b, c, d) {
		a = K((typeof a == "string" ? a : qb(a)) + "/" + b);
		return M.create(a, gb(c, d));
	}
	function Gb(a) {
		if (!(a.Da || a.Ea || a.link || a.m)) if (globalThis.XMLHttpRequest) r("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
		else try {
			a.m = ma(a.url);
		} catch (b) {
			throw new M.g(29);
		}
	}
	var M = {
		root: null,
		P: [],
		ha: {},
		streams: [],
		aa: 1,
		I: null,
		ga: "/",
		U: !1,
		ka: !0,
		ya: null,
		S: 0,
		g: class extends Error {
			name = "ErrnoError";
			constructor(a) {
				super(Ba ? I(Hb(a)) : "");
				this.u = a;
				for (var b in hb) if (hb[b] === a) {
					this.code = b;
					break;
				}
			}
		},
		sa: class {
			shared = {};
			node = null;
			get flags() {
				return this.shared.flags;
			}
			set flags(a) {
				this.shared.flags = a;
			}
			get position() {
				return this.shared.position;
			}
			set position(a) {
				this.shared.position = a;
			}
		},
		ra: class {
			h = {};
			l = {};
			C = null;
			listeners = null;
			L = 0;
			constructor(a, b, c, d) {
				a ||= this;
				this.parent = a;
				this.o = a.o;
				this.id = M.aa++;
				this.name = b;
				this.mode = c;
				this.rdev = d;
				this.atime = this.mtime = this.ctime = Date.now();
			}
			get read() {
				return (this.mode & 365) === 365;
			}
			set read(a) {
				a ? this.mode |= 365 : this.mode &= -366;
			}
			get write() {
				return (this.mode & 146) === 146;
			}
			set write(a) {
				a ? this.mode |= 146 : this.mode &= -147;
			}
			get Ea() {
				return P(this.mode);
			}
			get Da() {
				return (this.mode & 61440) === 8192;
			}
			Ga() {
				if (this.listeners) {
					var a;
					for (b of this.listeners) b.exclusive ? (a ||= []).push(b) : b.ua(32);
					if (a) {
						var b = (this.L || 0) % a.length;
						this.L = b + 1;
						a[b].ua(32);
					}
				}
			}
		},
		createNode(a, b, c, d) {
			g(typeof a == "object");
			a = new M.ra(a, b, c, d);
			tb(a);
			return a;
		},
		isFile(a) {
			return (a & 61440) === 32768;
		},
		isFIFO(a) {
			return (a & 61440) === 4096;
		},
		isSocket(a) {
			return (a & 49152) === 49152;
		},
		ea: 4096,
		ia: (a) => M.streams[a],
		va: {
			open(a) {
				a.l = M.za(a.node.rdev).l;
				a.l.open?.(a);
			},
			A() {
				throw new M.g(70);
			}
		},
		$: (a) => a >> 8,
		cb: (a) => a & 255,
		M: (a, b) => a << 8 | b,
		za: (a) => M.ha[a],
		pa(a, b) {
			function c(n) {
				g(M.S > 0);
				M.S--;
				return b(n);
			}
			function d(n) {
				if (n) {
					if (!d.xa) return d.xa = !0, c(n);
				} else ++h >= f.length && c(null);
			}
			typeof a == "function" && (b = a, a = !1);
			M.S++;
			M.S > 1 && l(`warning: ${M.S} FS.syncfs operations in flight at once, probably just doing extra work`);
			var f = Ab(M.root.o), h = 0, m;
			for (m of f) m.type.pa ? m.type.pa(m, a, d) : d(null);
		},
		o(a, b, c) {
			if (typeof a == "string") throw a;
			var d = c === "/", f = !c;
			if (d && M.root) throw new M.g(10);
			if (!d && !f) {
				var h = U(c, { T: !1 });
				c = h.path;
				h = h.node;
				if (h.C) throw new M.g(10);
				if (!P(h.mode)) throw new M.g(54);
			}
			b = {
				type: a,
				Ha: b,
				ma: c,
				P: []
			};
			a = a.o(b);
			a.o = b;
			b.root = a;
			d ? M.root = a : h && (h.C = b, h.o && h.o.P.push(b));
			return a;
		},
		lb(a) {
			a = U(a, { T: !1 });
			if (!a.node.C) throw new M.g(28);
			a = a.node;
			var b = a.C, c = Ab(b);
			for ([, f] of Object.entries(M.I)) for (; f;) {
				var d = f.N;
				c.includes(f.o) && eb(f);
				var f = d;
			}
			a.C = null;
			f = a.o.P.indexOf(b);
			g(f !== -1);
			a.o.P.splice(f, 1);
		},
		lookup(a, b) {
			return a.h.lookup(a, b);
		},
		H(a, b, c) {
			var d = U(a, { parent: !0 }).node;
			a = L(a);
			if (!a) throw new M.g(28);
			if (a === "." || a === "..") throw new M.g(20);
			var f = ub(d, a);
			if (f) throw new M.g(f);
			if (!d.h.H) throw new M.g(63);
			return d.h.H(d, a, b, c);
		},
		oa(a) {
			return Bb(U(a, { G: !0 }).node);
		},
		kb(a) {
			return Bb(a.node);
		},
		create(a, b = 438) {
			return M.H(a, b & 4095 | 32768, 0);
		},
		mkdir(a, b = 511) {
			return M.H(a, b & 1023 | 16384, 0);
		},
		eb(a, b) {
			var c = a.split("/"), d = "", f;
			for (f of c) if (f) {
				if (d || a.charAt(0) === "/") d += "/";
				d += f;
				try {
					M.mkdir(d, b);
				} catch (h) {
					if (h.u != 20) throw h;
				}
			}
		},
		symlink(a, b) {
			if (!Ta(a)) throw new M.g(44);
			var c = U(b, { parent: !0 }).node;
			if (!c) throw new M.g(44);
			b = L(b);
			var d = ub(c, b);
			if (d) throw new M.g(d);
			if (!c.h.symlink) throw new M.g(63);
			return c.h.symlink(c, b, a);
		},
		link(a, b, c) {
			var d = U(b, { parent: !0 }).node;
			if (!d) throw new M.g(44);
			b = L(b);
			var f = ub(d, b);
			if (f) throw new M.g(f);
			if (!d.h.link) throw new M.g(34);
			return d.h.link(d, b, a, c);
		},
		rename(a, b) {
			var c = Qa(a), d = Qa(b), f = L(a), h = L(b);
			var m = U(a, { parent: !0 });
			var n = m.node;
			m = U(b, { parent: !0 });
			m = m.node;
			if (!n || !m) throw new M.g(44);
			if (n.o !== m.o) throw new M.g(75);
			var w = Q(n, f);
			a = Ua(a, d);
			if (a.charAt(0) !== ".") throw new M.g(28);
			a = Ua(b, c);
			if (a.charAt(0) !== ".") throw new M.g(55);
			try {
				var q = Q(m, h);
			} catch (p) {}
			if (w !== q) {
				b = P(w.mode);
				if (f = vb(n, f, b)) throw new M.g(f);
				if (f = q ? vb(m, h, b) : ub(m, h)) throw new M.g(f);
				if (!n.h.rename) throw new M.g(63);
				if (w.C || q && q.C) throw new M.g(10);
				if (m !== n && (f = T(n, "w"))) throw new M.g(f);
				eb(w);
				try {
					n.h.rename(w, m, h), w.parent = m;
				} catch (p) {
					throw p;
				} finally {
					tb(w);
				}
			}
		},
		rmdir(a) {
			var b = U(a, { parent: !0 }).node;
			a = L(a);
			var c = Q(b, a), d = vb(b, a, !0);
			if (d) throw new M.g(d);
			if (!b.h.rmdir) throw new M.g(63);
			if (c.C) throw new M.g(10);
			b.h.rmdir(b, a);
			eb(c);
		},
		readdir(a) {
			a = U(a, { G: !0 }).node;
			return wb(a.h.readdir, 54)(a);
		},
		unlink(a) {
			var b = U(a, { parent: !0 }).node;
			if (!b) throw new M.g(44);
			a = L(a);
			var c = Q(b, a), d = vb(b, a, !1);
			if (d) throw new M.g(d);
			if (!b.h.unlink) throw new M.g(63);
			if (c.C) throw new M.g(10);
			b.h.unlink(b, a);
			eb(c);
		},
		readlink(a) {
			a = U(a).node;
			if (!a) throw new M.g(44);
			if (!a.h.readlink) throw new M.g(28);
			return a.h.readlink(a);
		},
		stat(a, b) {
			a = U(a, { G: !b }).node;
			return wb(a.h.B, 63)(a);
		},
		fstat(a) {
			var b = V(a);
			a = b.node;
			var c = b.l.B;
			b = c ? b : a;
			c ??= a.h.B;
			wb(c, 63);
			return c(b);
		},
		lstat(a) {
			return M.stat(a, !0);
		},
		chmod(a, b, c) {
			a = typeof a == "string" ? U(a, { G: !c }).node : a;
			Db(null, a, b, c);
		},
		lchmod(a, b) {
			M.chmod(a, b, !0);
		},
		fchmod(a, b) {
			a = V(a);
			Db(a, a.node, b, !1);
		},
		chown(a, b, c, d) {
			a = typeof a == "string" ? U(a, { G: !d }).node : a;
			zb(null, a, {
				timestamp: Date.now(),
				V: d
			});
		},
		lchown(a, b, c) {
			M.chown(a, b, c, !0);
		},
		fchown(a) {
			a = V(a);
			zb(a, a.node, {
				timestamp: Date.now(),
				V: !1
			});
		},
		truncate(a, b) {
			if (b < 0) throw new M.g(28);
			a = typeof a == "string" ? U(a, { G: !0 }).node : a;
			Eb(null, a, b);
		},
		bb(a, b) {
			a = V(a);
			if (b < 0 || (a.flags & 2097155) === 0) throw new M.g(28);
			Eb(a, a.node, b);
		},
		mb(a, b, c, d) {
			a = U(a, { G: !d });
			zb(null, a.node, {
				atime: b,
				mtime: c,
				V: d
			});
		},
		open(a, b, c = 438) {
			if (a === "") throw new M.g(44);
			if (typeof b == "string") {
				var d = {
					r: 0,
					"r+": 2,
					w: 577,
					"w+": 578,
					a: 1089,
					"a+": 1090
				}[b];
				if (typeof d == "undefined") throw Error(`Unknown file open mode: ${b}`);
				b = d;
			}
			c = b & 64 ? c & 4095 | 32768 : 0;
			if (typeof a == "object") d = a;
			else {
				var f = a.endsWith("/");
				var h = U(a, {
					G: !(b & 131072),
					Fa: !0
				});
				d = h.node;
				a = h.path;
			}
			h = !1;
			if (b & 64) if (d) {
				if (b & 128) throw new M.g(20);
			} else {
				if (f) throw new M.g(31);
				d = M.H(a, c | 511, 0);
				h = !0;
			}
			if (!d) throw new M.g(44);
			(d.mode & 61440) === 8192 && (b &= -513);
			if (b & 65536 && !P(d.mode)) throw new M.g(54);
			if (!h && (d ? (d.mode & 61440) === 40960 ? f = 32 : (f = [
				"r",
				"w",
				"rw"
			][b & 3], b & 512 && (f += "w"), f = P(d.mode) && (f !== "r" || b & 576) ? 31 : T(d, f)) : f = 44, f)) throw new M.g(f);
			b & 512 && !h && M.truncate(d, 0);
			b = xb({
				node: d,
				path: qb(d),
				flags: b & -131713,
				seekable: !0,
				position: 0,
				l: d.l,
				Ja: [],
				error: !1
			});
			b.l.open && b.l.open(b);
			h && M.chmod(d, c & 511);
			return b;
		},
		close(a) {
			if (a.fd === null) throw new M.g(8);
			a.W && (a.W = null);
			a.node?.Ga();
			try {
				a.l.close && a.l.close(a);
			} catch (b) {
				throw b;
			} finally {
				M.streams[a.fd] = null;
			}
			a.fd = null;
		},
		A(a, b, c) {
			if (a.fd === null) throw new M.g(8);
			if (!a.seekable || !a.l.A) throw new M.g(70);
			if (c != 0 && c != 1 && c != 2) throw new M.g(28);
			a.position = a.l.A(a, b, c);
			a.Ja = [];
			return a.position;
		},
		read(a, b, c, d, f) {
			g(c >= 0);
			if (d < 0 || f < 0) throw new M.g(28);
			if (a.fd === null) throw new M.g(8);
			if ((a.flags & 2097155) === 1) throw new M.g(8);
			if (P(a.node.mode)) throw new M.g(31);
			if (!a.l.read) throw new M.g(28);
			var h = typeof f != "undefined";
			if (!h) f = a.position;
			else if (!a.seekable) throw new M.g(70);
			b = a.l.read(a, b, c, d, f);
			h || (a.position += b);
			return b;
		},
		write(a, b, c, d, f, h) {
			g(c >= 0);
			g(b.subarray, "FS.write expects a TypedArray");
			if (d < 0 || f < 0) throw new M.g(28);
			if (a.fd === null) throw new M.g(8);
			if ((a.flags & 2097155) === 0) throw new M.g(8);
			if (P(a.node.mode)) throw new M.g(31);
			if (!a.l.write) throw new M.g(28);
			a.seekable && a.flags & 1024 && M.A(a, 0, 2);
			var m = typeof f != "undefined";
			if (!m) f = a.position;
			else if (!a.seekable) throw new M.g(70);
			b = a.l.write(a, b, c, d, f, h);
			m || (a.position += b);
			return b;
		},
		O(a, b, c, d, f) {
			if (d & 2 && !(f & 2) && (a.flags & 2097155) !== 2) throw new M.g(2);
			if ((a.flags & 2097155) === 1) throw new M.g(2);
			if (!a.l.O) throw new M.g(43);
			if (!b) throw new M.g(28);
			return a.l.O(a, b, c, d, f);
		},
		R(a, b, c, d, f) {
			g(c >= 0);
			return a.l.R ? a.l.R(a, b, c, d, f) : 0;
		},
		Y(a, b, c) {
			if (!a.l.Y) throw new M.g(59);
			return a.l.Y(a, b, c);
		},
		readFile(a, b = {}) {
			b.flags ?? (b.flags = 0);
			b.encoding ?? (b.encoding = "binary");
			b.encoding !== "utf8" && b.encoding !== "binary" && r(`Invalid encoding type "${b.encoding}"`);
			var c = M.open(a, b.flags);
			a = M.stat(a).size;
			var d = new Uint8Array(a);
			M.read(c, d, 0, a, 0);
			b.encoding === "utf8" && (d = H(d));
			M.close(c);
			return d;
		},
		writeFile(a, b, c = {}) {
			c.flags ?? (c.flags = 577);
			a = M.open(a, c.flags, c.mode);
			b = fb(b);
			M.write(a, b, 0, b.byteLength, void 0, c.Ua);
			M.close(a);
		},
		cwd: () => M.ga,
		chdir(a) {
			a = U(a, { G: !0 });
			if (a.node === null) throw new M.g(44);
			if (!P(a.node.mode)) throw new M.g(54);
			var b = T(a.node, "x");
			if (b) throw new M.g(b);
			M.ga = a.path;
		},
		init(a, b, c) {
			g(!M.U, "FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)");
			M.U = !0;
			a ? M.K("/dev", "stdin", a) : M.symlink("/dev/tty", "/dev/stdin");
			b ? M.K("/dev", "stdout", null, b) : M.symlink("/dev/tty", "/dev/stdout");
			c ? M.K("/dev", "stderr", null, c) : M.symlink("/dev/tty1", "/dev/stderr");
			a = M.open("/dev/stdin", 0);
			b = M.open("/dev/stdout", 1);
			c = M.open("/dev/stderr", 1);
			g(a.fd === 0, `invalid handle for stdin (${a.fd})`);
			g(b.fd === 1, `invalid handle for stdout (${b.fd})`);
			g(c.fd === 2, `invalid handle for stderr (${c.fd})`);
		},
		hb() {
			M.U = !1;
			Ib(0);
			for (var a of M.streams) a && M.close(a);
		},
		Wa(a, b) {
			a = typeof a == "string" ? a : qb(a);
			for (b = b.split("/").reverse(); b.length;) {
				var c = b.pop();
				if (c) {
					var d = K(a + "/" + c);
					try {
						M.mkdir(d);
					} catch (f) {
						if (f.u != 20) throw f;
					}
					a = d;
				}
			}
			return d;
		},
		K(a, b, c, d) {
			a = K((typeof a == "string" ? a : qb(a)) + "/" + b);
			b = gb(!!c, !!d);
			var f;
			(f = M.K).$ ?? (f.$ = 64);
			f = M.M(M.K.$++, 0);
			$a(f, {
				open(h) {
					h.seekable = !1;
				},
				close() {
					d?.buffer?.length && d(10);
				},
				read(h, m, n, w) {
					for (var q = 0, p = 0; p < w; p++) {
						try {
							var t = c();
						} catch (B) {
							throw new M.g(29);
						}
						if (t === void 0 && !q) throw new M.g(6);
						if (t === null || t === void 0) break;
						q++;
						m[n + p] = t;
					}
					q && (h.node.atime = Date.now());
					return q;
				},
				write(h, m, n, w) {
					for (var q = 0; q < w; q++) try {
						d(m[n + q]);
					} catch (p) {
						throw new M.g(29);
					}
					w && (h.node.mtime = h.node.ctime = Date.now());
					return q;
				}
			});
			return Cb(a, b, f);
		},
		Va(a, b, c, d, f) {
			function h(p, t, B, D, G) {
				p = p.node.m;
				if (G >= p.length) return 0;
				D = Math.min(p.length - G, D);
				g(D >= 0);
				if (p.slice) for (var F = 0; F < D; F++) t[B + F] = p[G + F];
				else for (F = 0; F < D; F++) t[B + F] = p.get(G + F);
				return D;
			}
			class m {
				Z = !1;
				L = [];
				X = void 0;
				na = 0;
				la = 0;
				get(p) {
					if (!(p > this.length - 1 || p < 0)) {
						var t = p % this.chunkSize;
						return this.X(p / this.chunkSize | 0)[t];
					}
				}
				Ka(p) {
					this.X = p;
				}
				qa() {
					var p = new XMLHttpRequest();
					p.open("HEAD", c, !1);
					p.send(null);
					p.status >= 200 && p.status < 300 || p.status === 304 || r(`Couldn't load ${c}. Status: ${p.status}`);
					var t = Number(p.getResponseHeader("Content-length")), B, D = (B = p.getResponseHeader("Accept-Ranges")) && B === "bytes";
					p = (B = p.getResponseHeader("Content-Encoding")) && B === "gzip";
					var G = 1048576;
					D || (G = t);
					var F = this;
					F.Ka((ba) => {
						var na = ba * G, ca = (ba + 1) * G - 1;
						ca = Math.min(ca, t - 1);
						if (typeof F.L[ba] == "undefined") {
							var ec = F.L;
							na > ca && r(`invalid range (${na}, ${ca}) or no bytes requested!`);
							ca > t - 1 && r(`only ${t} bytes available! programmer error!`);
							var J = new XMLHttpRequest();
							J.open("GET", c, !1);
							t !== G && J.setRequestHeader("Range", `bytes=${na}-${ca}`);
							J.responseType = "arraybuffer";
							J.overrideMimeType && J.overrideMimeType("text/plain; charset=x-user-defined");
							J.send(null);
							J.status >= 200 && J.status < 300 || J.status === 304 || r(`Couldn't load ${c}. Status: ${J.status}`);
							na = J.response !== void 0 ? new Uint8Array(J.response || []) : Xa(J.responseText ?? "");
							ec[ba] = na;
						}
						typeof F.L[ba] == "undefined" && r("doXHR failed!");
						return F.L[ba];
					});
					if (p || !t) G = t = 1, G = t = this.X(0).length, k("LazyFiles on gzip forces download of the whole file when length is accessed");
					this.na = t;
					this.la = G;
					this.Z = !0;
				}
				get length() {
					this.Z || this.qa();
					return this.na;
				}
				get chunkSize() {
					this.Z || this.qa();
					return this.la;
				}
			}
			if (globalThis.XMLHttpRequest) {
				da || r("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");
				var n = new m();
				var w = void 0;
			} else w = c, n = void 0;
			var q = Fb(a, b, d, f);
			n ? q.m = n : w && (q.m = null, q.url = w);
			Object.defineProperties(q, { v: { get: function() {
				return this.m.length;
			} } });
			a = {};
			for (let [p, t] of Object.entries(q.l)) a[p] = (...B) => {
				Gb(q);
				return t(...B);
			};
			a.read = (p, t, B, D, G) => {
				Gb(q);
				return h(p, t, B, D, G);
			};
			a.O = (p, t, B) => {
				Gb(q);
				var D = db();
				if (!D) throw new M.g(48);
				h(p, y, D, t, B);
				return {
					Ia: D,
					ta: !0
				};
			};
			q.l = a;
			return q;
		}
	}, Ha;
	function Jb(a, b) {
		if (b.charAt(0) === "/") return b;
		a = a === -100 ? M.cwd() : V(a).path;
		if (b.length == 0) throw new M.g(44);
		return a + "/" + b;
	}
	var Kb = void 0, W = () => {
		g(Kb != void 0);
		var a = A[+Kb >> 2];
		Kb += 4;
		return a;
	}, z, X = (a, b, c) => {
		g(typeof c == "number", "stringToUTF8 requires a third parameter that specifies the length of the output buffer");
		return Wa(a, Ea, b, c);
	}, Lb = (a) => a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0), Mb = [
		0,
		31,
		60,
		91,
		121,
		152,
		182,
		213,
		244,
		274,
		305,
		335
	], Nb = [
		0,
		31,
		59,
		90,
		120,
		151,
		181,
		212,
		243,
		273,
		304,
		334
	], Ob = {}, Qb = () => {
		if (!Pb) {
			var a = {
				USER: "web_user",
				LOGNAME: "web_user",
				PATH: "/",
				PWD: "/",
				HOME: "/home/web_user",
				LANG: (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8",
				_: ha
			}, b;
			for (b in Ob) Ob[b] === void 0 ? delete a[b] : a[b] = Ob[b];
			var c = [];
			for (b in a) c.push(`${b}=${a[b]}`);
			Pb = c;
		}
		return Pb;
	}, Pb, Rb = [], Sb = (a) => {
		var b = Rb[a];
		b || (Rb[a] = b = Y.get(a));
		g(Y.get(a) == b, "table mirror is out of date");
		return b;
	}, Tb = (a) => {
		var b = Module["_" + a];
		g(b, `Cannot call unknown function ${a}, make sure it is exported`);
		return b;
	}, Z, Ub = [], Vb = (a) => {
		var b = a.length;
		g(b < 16384);
		return [
			b % 128 | 128,
			b >> 7,
			...a
		];
	}, Wb = {
		i: 127,
		p: 127,
		j: 126,
		f: 125,
		d: 124,
		e: 111
	}, Xb = (a) => Vb(Array.from(a, (b) => {
		var c = Wb[b];
		g(c, `invalid signature char: ${b}`);
		return c;
	})), Fa, Ga;
	M.Xa = (a, b, c, d, f, h, m, n, w, q) => {
		rb(a, b, c, d, f, n, w, q).then(h).catch(m);
	};
	M.gb = rb;
	M.I = Array(4096);
	M.o(O, {}, "/");
	M.mkdir("/tmp");
	M.mkdir("/home");
	M.mkdir("/home/web_user");
	(function() {
		M.mkdir("/dev");
		$a(M.M(1, 3), {
			read: () => 0,
			write: (d, f, h, m) => m,
			A: () => 0
		});
		Cb("/dev/null", M.M(1, 3));
		Za(M.M(5, 0), bb);
		Za(M.M(6, 0), cb);
		Cb("/dev/tty", M.M(5, 0));
		Cb("/dev/tty1", M.M(6, 0));
		var a = /* @__PURE__ */ new Uint8Array(1024), b = 0, c = () => {
			b || (Sa(a), b = a.byteLength);
			return a[--b];
		};
		M.K("/dev", "random", c);
		M.K("/dev", "urandom", c);
		M.mkdir("/dev/shm");
		M.mkdir("/dev/shm/tmp");
	})();
	(function() {
		M.mkdir("/proc");
		var a = M.mkdir("/proc/self");
		M.mkdir("/proc/self/fd");
		M.o({ o() {
			var b = M.createNode(a, "fd", 16895, 73);
			b.l = { A: O.l.A };
			b.h = {
				lookup(c, d) {
					c = +d;
					var f = V(c);
					c = {
						parent: null,
						o: { ma: "fake" },
						h: { readlink: () => f.path },
						id: c + 1
					};
					return c.parent = c;
				},
				readdir() {
					return Array.from(M.streams.entries()).filter(([, c]) => c).map(([c]) => c.toString());
				}
			};
			return b;
		} }, {}, "/proc/self/fd");
	})();
	M.ya = { MEMFS: O };
	v("ENVIRONMENT");
	v("arguments");
	v("canvas");
	v("dynamicLibraries");
	v("elementPointerLock");
	v("instantiateWasm");
	v("monitorRunDependencies");
	v("noExitRuntime");
	v("noInitialRun");
	v("onAbort");
	v("onExit");
	v("onRuntimeInitialized");
	v("postRun");
	v("preInit");
	v("print");
	v("printErr");
	v("setStatus");
	v("statusMessage");
	v("stderr");
	v("stdin");
	v("stdout");
	v("thisProgram");
	v("wasm");
	v("websocket");
	v("fetchSettings");
	v("logReadFiles");
	v("loadSplitModule");
	v("onMalloc");
	v("onRealloc");
	v("onFree");
	v("onSbrkGrow");
	v("onCOSCacheHit");
	v("onCOSCacheMiss");
	v("onCOSStore");
	v("GL_MAX_TEXTURE_IMAGE_UNITS");
	v("SDL_canPlayWithWebAudio");
	v("SDL_numSimultaneouslyQueuedBuffers");
	v("freePreloadedMediaOnUse");
	v("preinitializedWebGLContext");
	v("keyboardListeningElement");
	v("doNotCaptureKeyboard");
	v("extraStackTrace");
	v("preloadPlugins");
	v("preMainLoop");
	v("postMainLoop");
	v("forcedAspectRatio");
	v("mainScriptUrlOrBlob");
	v("onFullScreen");
	v("INITIAL_MEMORY");
	v("wasmMemory");
	v("wasmBinary");
	g(typeof Module.memoryInitializerPrefixURL == "undefined", "Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead");
	g(typeof Module.pthreadMainPrefixURL == "undefined", "Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead");
	g(typeof Module.cdInitializerPrefixURL == "undefined", "Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead");
	g(typeof Module.filePackagePrefixURL == "undefined", "Module.filePackagePrefixURL option was removed, use Module.locateFile instead");
	g(typeof Module.read == "undefined", "Module.read option was removed");
	g(typeof Module.readAsync == "undefined", "Module.readAsync option was removed (modify readAsync in JS)");
	g(typeof Module.readBinary == "undefined", "Module.readBinary option was removed (modify readBinary in JS)");
	g(typeof Module.setWindowTitle == "undefined", "Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)");
	g(typeof Module.TOTAL_MEMORY == "undefined", "Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY");
	g(typeof Module.ENVIRONMENT == "undefined", "Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)");
	g(typeof Module.STACK_SIZE == "undefined", "STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time");
	g(typeof Module.wasmMemory == "undefined", "Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally");
	g(typeof Module.INITIAL_MEMORY == "undefined", "Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically");
	Module.ENV = Ob;
	Module.ccall = (a, b, c, d) => {
		var f = {
			string: (q) => {
				var p = 0;
				if (q !== null && q !== void 0 && q !== 0) {
					p = N(q) + 1;
					var t = Yb(p);
					X(q, t, p);
					p = t;
				}
				return p;
			},
			array: (q) => {
				var p = Yb(q.length);
				g(q.length >= 0, "writeArrayToMemory array must have a length (should be an array or typed array)");
				y.set(q, p);
				return p;
			}
		};
		a = Tb(a);
		var h = [], m = 0;
		g(b !== "array", "return type should not be \"array\"");
		if (d) for (var n = 0; n < d.length; n++) {
			var w = f[c[n]];
			w ? (m ||= Zb(), h[n] = w(d[n])) : h[n] = d[n];
		}
		c = a(...h);
		return c = function(q) {
			m && $b(m);
			return b === "string" ? I(q) : b === "boolean" ? !!q : q;
		}(c);
	};
	Module.addFunction = (a, b) => {
		g(typeof a != "undefined");
		if (!Z) {
			Z = /* @__PURE__ */ new WeakMap();
			var c = Y.length;
			if (Z) for (var d = 0; d < 0 + c; d++) {
				var f = Sb(d);
				f && Z.set(f, d);
			}
		}
		if (c = Z.get(a) || 0) return c;
		a: if (Ub.length) var h = Ub.pop();
		else {
			try {
				h = Y.grow(1);
				break a;
			} catch (m) {
				if (!(m instanceof RangeError)) throw m;
				r("Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.");
			}
			h = void 0;
		}
		try {
			c = h, Y.set(c, a), Rb[c] = Y.get(c);
		} catch (m) {
			if (!(m instanceof TypeError)) throw m;
			g(typeof b != "undefined", "Missing signature argument to addFunction: " + a);
			b = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...Vb([
				1,
				96,
				...Xb(b.slice(1)),
				...Xb(b[0] === "v" ? "" : b[0])
			]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
			b = new WebAssembly.Module(b);
			b = new WebAssembly.Instance(b, { e: { f: a } }).exports.f;
			c = h;
			Y.set(c, b);
			Rb[c] = Y.get(c);
		}
		Z.set(a, h);
		return h;
	};
	Module.removeFunction = (a) => {
		Z.delete(Sb(a));
		Y.set(a, null);
		Rb[a] = Y.get(a);
		Ub.push(a);
	};
	Module.setValue = function(a, b, c = "i8") {
		c.endsWith("*") && (c = "*");
		switch (c) {
			case "i1":
				y[a] = b;
				break;
			case "i8":
				y[a] = b;
				break;
			case "i16":
				z[a >> 1] = b;
				break;
			case "i32":
				A[a >> 2] = b;
				break;
			case "i64":
				Ha[a >> 3] = BigInt(b);
				break;
			case "float":
				Fa[a >> 2] = b;
				break;
			case "double":
				Ga[a >> 3] = b;
				break;
			case "*":
				x[a >> 2] = b;
				break;
			default: r(`invalid type for setValue: ${c}`);
		}
	};
	Module.getValue = function(a, b = "i8") {
		b.endsWith("*") && (b = "*");
		switch (b) {
			case "i1": return y[a];
			case "i8": return y[a];
			case "i16": return z[a >> 1];
			case "i32": return A[a >> 2];
			case "i64": return Ha[a >> 3];
			case "float": return Fa[a >> 2];
			case "double": return Ga[a >> 3];
			case "*": return x[a >> 2];
			default: r(`invalid type for getValue: ${b}`);
		}
	};
	Module.UTF8ToString = I;
	Module.stringToUTF8 = X;
	Module.lengthBytesUTF8 = N;
	Module.stringToNewUTF8 = (a) => {
		var b = N(a) + 1, c = ac(b);
		c && X(a, c, b);
		return c;
	};
	Module.FS = M;
	"writeI53ToI64 writeI53ToI64Clamped writeI53ToI64Signaling writeI53ToU64Clamped writeI53ToU64Signaling readI53FromI64 readI53FromU64 convertI32PairToI53 convertI32PairToI53Checked convertU32PairToI53 getTempRet0 setTempRet0 createNamedFunction zeroMemory withStackSave inetPton4 inetNtop4 inetPton6 inetNtop6 readSockaddr writeSockaddr readEmAsmArgs jstoi_q autoResumeAudioContext getDynCaller dynCall handleException runtimeKeepalivePush runtimeKeepalivePop callUserCallback maybeExit asmjsMangle HandleAllocator addOnInit addOnPostCtor addOnPreMain addOnExit addOnPostRun STACK_SIZE STACK_ALIGN POINTER_SIZE ASSERTIONS cwrap intArrayToString AsciiToString stringToAscii UTF16ToString stringToUTF16 lengthBytesUTF16 UTF32ToString stringToUTF32 lengthBytesUTF32 registerKeyEventCallback maybeCStringToJsString findEventTarget getBoundingClientRect fillMouseEventData registerMouseEventCallback registerWheelEventCallback registerUiEventCallback registerFocusEventCallback fillDeviceOrientationEventData registerDeviceOrientationEventCallback fillDeviceMotionEventData registerDeviceMotionEventCallback screenOrientation fillOrientationChangeEventData registerOrientationChangeEventCallback fillFullscreenChangeEventData registerFullscreenChangeEventCallback callCanvasResizedCallback JSEvents_requestFullscreen JSEvents_resizeCanvasForFullscreen registerRestoreOldStyle hideEverythingExceptGivenElement restoreHiddenElements setLetterbox currentFullscreenStrategy softFullscreenResizeWebGLRenderTarget doRequestFullscreen fillPointerlockChangeEventData registerPointerlockChangeEventCallback registerPointerlockErrorEventCallback requestPointerLock fillVisibilityChangeEventData registerVisibilityChangeEventCallback registerTouchEventCallback fillGamepadEventData registerGamepadEventCallback registerBeforeUnloadEventCallback fillBatteryEventData registerBatteryEventCallback setCanvasElementSize getCanvasElementSize jsStackTrace getCallstack convertPCtoSourceLocation wasiRightsToMuslOFlags wasiOFlagsToMuslOFlags safeSetTimeout safeClearTimeout setImmediateWrapped safeRequestAnimationFrame clearImmediateWrapped registerPostMainLoop registerPreMainLoop getPromise makePromise addPromise idsToPromises makePromiseCallback Browser_asyncPrepareDataCounter arraySum addDays getSocketFromFD getSocketAddress FS_mkdirTree _setNetworkCallback".split(" ").forEach(function(a) {
		wa(a);
	});
	"run out err callMain abort wasmExports writeStackCookie checkStackCookie INT53_MAX INT53_MIN bigintToI53Checked HEAP8 HEAPU8 HEAP16 HEAPU16 HEAP32 HEAPF32 HEAPF64 HEAP64 HEAPU64 stackSave stackRestore stackAlloc ptrToString exitJS getHeapMax growMemory ERRNO_CODES strError DNS Protocols Sockets timers warnOnce readEmAsmArgsArray getExecutableName keepRuntimeAlive asyncLoad alignMemory mmapAlloc wasmTable wasmMemory getUniqueRunDependency noExitRuntime addRunDependency removeRunDependency addOnPreRun convertJsFunctionToWasm freeTableIndexes functionsInTableMap getEmptyTableSlot updateTableMap getFunctionAddress PATH PATH_FS UTF8Decoder UTF8ArrayToString stringToUTF8Array intArrayFromString UTF16Decoder stringToUTF8OnStack writeArrayToMemory JSEvents specialHTMLTargets findCanvasEventTarget restoreOldWindowedStyle UNWIND_CACHE ExitStatus getEnvStrings checkWasiClock doReadv doWritev initRandomFill randomFill emSetImmediate emClearImmediate_deps emClearImmediate promiseMap Browser requestFullscreen setCanvasSize getUserMedia createContext getPreloadedImageData__data wget MONTH_DAYS_REGULAR MONTH_DAYS_LEAP MONTH_DAYS_REGULAR_CUMULATIVE MONTH_DAYS_LEAP_CUMULATIVE isLeapYear ydayFromDate SYSCALLS preloadPlugins FS_createPreloadedFile FS_preloadFile FS_modeStringToFlags FS_getMode FS_fileDataToTypedArray FS_stdin_getChar_buffer FS_stdin_getChar FS_unlink FS_createPath FS_createDevice FS_readFile FS_root FS_mounts FS_devices FS_streams FS_nextInode FS_nameTable FS_currentPath FS_initialized FS_ignorePermissions FS_filesystems FS_syncFSRequests FS_lookupPath FS_getPath FS_hashName FS_hashAddNode FS_hashRemoveNode FS_lookupNode FS_createNode FS_destroyNode FS_isRoot FS_isMountpoint FS_isFile FS_isDir FS_isLink FS_isChrdev FS_isBlkdev FS_isFIFO FS_isSocket FS_flagsToPermissionString FS_nodePermissions FS_mayLookup FS_mayCreate FS_mayDelete FS_mayOpen FS_checkOpExists FS_nextfd FS_getStreamChecked FS_getStream FS_createStream FS_closeStream FS_dupStream FS_doSetAttr FS_chrdev_stream_ops FS_major FS_minor FS_makedev FS_registerDevice FS_getDevice FS_getMounts FS_syncfs FS_mount FS_unmount FS_lookup FS_mknod FS_statfs FS_statfsStream FS_statfsNode FS_create FS_mkdir FS_mkdev FS_symlink FS_link FS_rename FS_rmdir FS_readdir FS_readlink FS_stat FS_fstat FS_lstat FS_doChmod FS_chmod FS_lchmod FS_fchmod FS_doChown FS_chown FS_lchown FS_fchown FS_doTruncate FS_truncate FS_ftruncate FS_utime FS_open FS_close FS_isClosed FS_llseek FS_read FS_write FS_mmap FS_msync FS_ioctl FS_writeFile FS_cwd FS_chdir FS_createDefaultDirectories FS_createDefaultDevices FS_createSpecialDirectories FS_createStandardStreams FS_staticInit FS_init FS_quit FS_createFile FS_createDataFile FS_forceLoadFile FS_createLazyFile MEMFS TTY PIPEFS SOCKFS".split(" ").forEach(wa);
	Module._lua_checkstack = u("_lua_checkstack");
	Module._lua_xmove = u("_lua_xmove");
	Module._lua_atpanic = u("_lua_atpanic");
	Module._lua_newthread = u("_lua_newthread");
	Module._lua_gettop = u("_lua_gettop");
	Module._lua_settop = u("_lua_settop");
	Module._lua_remove = u("_lua_remove");
	Module._lua_insert = u("_lua_insert");
	Module._lua_replace = u("_lua_replace");
	Module._lua_pushvalue = u("_lua_pushvalue");
	Module._lua_type = u("_lua_type");
	Module._lua_typename = u("_lua_typename");
	Module._lua_iscfunction = u("_lua_iscfunction");
	Module._lua_isnumber = u("_lua_isnumber");
	Module._lua_isstring = u("_lua_isstring");
	Module._lua_isuserdata = u("_lua_isuserdata");
	Module._lua_rawequal = u("_lua_rawequal");
	Module._lua_equal = u("_lua_equal");
	Module._lua_lessthan = u("_lua_lessthan");
	Module._lua_tonumber = u("_lua_tonumber");
	Module._lua_tointeger = u("_lua_tointeger");
	Module._lua_toboolean = u("_lua_toboolean");
	Module._lua_tolstring = u("_lua_tolstring");
	Module._lua_objlen = u("_lua_objlen");
	Module._lua_tocfunction = u("_lua_tocfunction");
	Module._lua_touserdata = u("_lua_touserdata");
	Module._lua_tothread = u("_lua_tothread");
	Module._lua_topointer = u("_lua_topointer");
	Module._lua_pushnil = u("_lua_pushnil");
	Module._lua_pushnumber = u("_lua_pushnumber");
	Module._lua_pushinteger = u("_lua_pushinteger");
	Module._lua_pushlstring = u("_lua_pushlstring");
	Module._lua_pushstring = u("_lua_pushstring");
	Module._lua_pushvfstring = u("_lua_pushvfstring");
	Module._lua_pushfstring = u("_lua_pushfstring");
	Module._lua_pushcclosure = u("_lua_pushcclosure");
	Module._lua_pushboolean = u("_lua_pushboolean");
	Module._lua_pushlightuserdata = u("_lua_pushlightuserdata");
	Module._lua_pushthread = u("_lua_pushthread");
	Module._lua_gettable = u("_lua_gettable");
	Module._lua_getfield = u("_lua_getfield");
	Module._lua_rawget = u("_lua_rawget");
	Module._lua_rawgeti = u("_lua_rawgeti");
	Module._lua_createtable = u("_lua_createtable");
	Module._lua_getmetatable = u("_lua_getmetatable");
	Module._lua_getfenv = u("_lua_getfenv");
	Module._lua_settable = u("_lua_settable");
	Module._lua_setfield = u("_lua_setfield");
	Module._lua_rawset = u("_lua_rawset");
	Module._lua_rawseti = u("_lua_rawseti");
	Module._lua_setmetatable = u("_lua_setmetatable");
	Module._lua_setfenv = u("_lua_setfenv");
	Module._lua_call = u("_lua_call");
	Module._lua_pcall = u("_lua_pcall");
	Module._lua_cpcall = u("_lua_cpcall");
	Module._lua_load = u("_lua_load");
	Module._lua_dump = u("_lua_dump");
	Module._lua_status = u("_lua_status");
	Module._lua_gc = u("_lua_gc");
	Module._lua_error = u("_lua_error");
	Module._lua_next = u("_lua_next");
	Module._lua_concat = u("_lua_concat");
	Module._lua_getallocf = u("_lua_getallocf");
	Module._lua_setallocf = u("_lua_setallocf");
	Module._lua_newuserdata = u("_lua_newuserdata");
	Module._lua_getupvalue = u("_lua_getupvalue");
	Module._lua_setupvalue = u("_lua_setupvalue");
	Module._luaL_argerror = u("_luaL_argerror");
	Module._lua_getstack = u("_lua_getstack");
	Module._luaL_error = u("_luaL_error");
	Module._lua_getinfo = u("_lua_getinfo");
	Module._luaL_typerror = u("_luaL_typerror");
	Module._luaL_where = u("_luaL_where");
	Module._luaL_checkoption = u("_luaL_checkoption");
	Module._luaL_optlstring = u("_luaL_optlstring");
	Module._luaL_checklstring = u("_luaL_checklstring");
	Module._luaL_newmetatable = u("_luaL_newmetatable");
	Module._luaL_checkudata = u("_luaL_checkudata");
	Module._luaL_checkstack = u("_luaL_checkstack");
	Module._luaL_checktype = u("_luaL_checktype");
	Module._luaL_checkany = u("_luaL_checkany");
	Module._luaL_checknumber = u("_luaL_checknumber");
	Module._luaL_optnumber = u("_luaL_optnumber");
	Module._luaL_checkinteger = u("_luaL_checkinteger");
	Module._luaL_optinteger = u("_luaL_optinteger");
	Module._luaL_getmetafield = u("_luaL_getmetafield");
	Module._luaL_callmeta = u("_luaL_callmeta");
	Module._luaL_register = u("_luaL_register");
	Module._luaL_gsub = u("_luaL_gsub");
	Module._luaL_prepbuffer = u("_luaL_prepbuffer");
	Module._luaL_buffinit = u("_luaL_buffinit");
	Module._luaL_addlstring = u("_luaL_addlstring");
	Module._luaL_addstring = u("_luaL_addstring");
	Module._luaL_pushresult = u("_luaL_pushresult");
	Module._luaL_addvalue = u("_luaL_addvalue");
	Module._luaL_ref = u("_luaL_ref");
	Module._luaL_unref = u("_luaL_unref");
	Module._luaL_loadfile = u("_luaL_loadfile");
	var Hb = u("_strerror");
	Module._luaL_loadbuffer = u("_luaL_loadbuffer");
	Module._luaL_loadstring = u("_luaL_loadstring");
	Module._luaL_newstate = u("_luaL_newstate");
	Module._lua_newstate = u("_lua_newstate");
	Module._free = u("_free");
	Module._realloc = u("_realloc");
	Module._luaopen_base = u("_luaopen_base");
	Module._lua_yield = u("_lua_yield");
	Module._lua_resume = u("_lua_resume");
	Module._luaopen_debug = u("_luaopen_debug");
	Module._lua_gethookmask = u("_lua_gethookmask");
	Module._lua_gethook = u("_lua_gethook");
	Module._lua_gethookcount = u("_lua_gethookcount");
	Module._lua_getlocal = u("_lua_getlocal");
	Module._lua_sethook = u("_lua_sethook");
	Module._lua_setlocal = u("_lua_setlocal");
	Module._luaL_openlibs = u("_luaL_openlibs");
	Module._luaopen_package = u("_luaopen_package");
	Module._luaopen_table = u("_luaopen_table");
	Module._luaopen_io = u("_luaopen_io");
	Module._luaopen_os = u("_luaopen_os");
	Module._luaopen_string = u("_luaopen_string");
	Module._luaopen_math = u("_luaopen_math");
	var Ib = u("_fflush");
	Module._lua_close = u("_lua_close");
	var ac = Module._malloc = u("_malloc"), bc = u("_setThrew"), cc = u("_emscripten_stack_init"), za = u("_emscripten_stack_get_end"), $b = u("__emscripten_stack_restore"), Yb = u("__emscripten_stack_alloc"), Zb = u("_emscripten_stack_get_current"), Da = u("wasmMemory"), Y = u("wasmTable"), hc = {
		__assert_fail: (a, b, c, d) => r(`Assertion failed: ${I(a)}, at: ` + [
			b ? I(b) : "unknown filename",
			c,
			d ? I(d) : "unknown function"
		]),
		__syscall_dup3: function(a, b, c) {
			try {
				if (a === b || c & -524289) return -28;
				var d = V(a);
				if (b < 0 || b >= M.ea) return -8;
				var f = M.ia(b);
				f && M.close(f);
				var h = yb(d, b);
				c & 524288 && (h.flags |= 524288);
				return h.fd;
			} catch (m) {
				if (typeof M == "undefined" || m.name !== "ErrnoError") throw m;
				return -m.u;
			}
		},
		__syscall_fcntl64: function(a, b, c) {
			Kb = c;
			try {
				var d = V(a);
				switch (b) {
					case 0:
						var f = W();
						if (f < 0) break;
						for (; M.streams[f];) f++;
						return yb(d, f).fd;
					case 1:
					case 2: return 0;
					case 3: return d.flags;
					case 4: return f = W(), d.flags = d.flags & -289793 | f & 289792, 0;
					case 12: return f = W(), z[f + 0 >> 1] = 2, 0;
					case 13:
					case 14: return 0;
				}
				return -28;
			} catch (h) {
				if (typeof M == "undefined" || h.name !== "ErrnoError") throw h;
				return -h.u;
			}
		},
		__syscall_ioctl: function(a, b, c) {
			Kb = c;
			try {
				var d = V(a);
				switch (b) {
					case 21509: return d.tty ? 0 : -59;
					case 21505:
						if (!d.tty) return -59;
						if (d.tty.J.Aa) {
							a = [
								3,
								28,
								127,
								21,
								4,
								0,
								1,
								0,
								17,
								19,
								26,
								0,
								18,
								15,
								23,
								22,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0
							];
							var f = W();
							A[f >> 2] = 25856;
							A[f + 4 >> 2] = 5;
							A[f + 8 >> 2] = 191;
							A[f + 12 >> 2] = 35387;
							for (var h = 0; h < 32; h++) y[f + h + 17] = a[h] || 0;
						}
						return 0;
					case 21510:
					case 21511:
					case 21512: return d.tty ? 0 : -59;
					case 21506:
					case 21507:
					case 21508:
						if (!d.tty) return -59;
						if (d.tty.J.Ba) for (f = W(), a = [], h = 0; h < 32; h++) a.push(y[f + h + 17]);
						return 0;
					case 21519:
						if (!d.tty) return -59;
						f = W();
						return A[f >> 2] = 0;
					case 21520: return d.tty ? -28 : -59;
					case 21537:
					case 21531: return f = W(), M.Y(d, b, f);
					case 21523:
						if (!d.tty) return -59;
						d.tty.J.Ca && (h = [24, 80], f = W(), z[f >> 1] = h[0], z[f + 2 >> 1] = h[1]);
						return 0;
					case 21524: return d.tty ? 0 : -59;
					case 21515: return d.tty ? 0 : -59;
					default: return -28;
				}
			} catch (m) {
				if (typeof M == "undefined" || m.name !== "ErrnoError") throw m;
				return -m.u;
			}
		},
		__syscall_openat: function(a, b, c, d) {
			Kb = d;
			try {
				b = I(b);
				b = Jb(a, b);
				var f = d ? W() : 0;
				c & 64 && (f &= -19);
				return M.open(b, c, f).fd;
			} catch (h) {
				if (typeof M == "undefined" || h.name !== "ErrnoError") throw h;
				return -h.u;
			}
		},
		__syscall_readlinkat: function(a, b, c, d) {
			try {
				b = I(b);
				b = Jb(a, b);
				if (d <= 0) return -28;
				var f = M.readlink(b), h = Math.min(d, N(f)), m = y[c + h];
				X(f, c, d + 1);
				y[c + h] = m;
				return h;
			} catch (n) {
				if (typeof M == "undefined" || n.name !== "ErrnoError") throw n;
				return -n.u;
			}
		},
		__syscall_renameat: function(a, b, c, d) {
			try {
				return b = I(b), d = I(d), b = Jb(a, b), d = Jb(c, d), M.rename(b, d), 0;
			} catch (f) {
				if (typeof M == "undefined" || f.name !== "ErrnoError") throw f;
				return -f.u;
			}
		},
		__syscall_rmdir: function(a) {
			try {
				return a = I(a), M.rmdir(a), 0;
			} catch (b) {
				if (typeof M == "undefined" || b.name !== "ErrnoError") throw b;
				return -b.u;
			}
		},
		__syscall_unlinkat: function(a, b, c) {
			try {
				b = I(b);
				b = Jb(a, b);
				if (c) if (c === 512) M.rmdir(b);
				else return -28;
				else M.unlink(b);
				return 0;
			} catch (d) {
				if (typeof M == "undefined" || d.name !== "ErrnoError") throw d;
				return -d.u;
			}
		},
		_emscripten_system: (a) => {
			if (e) {
				if (!a) return 1;
				a = I(a);
				if (!a.length) return 0;
				a = fa("node:child_process").jb(a, [], {
					ib: !0,
					stdio: "inherit"
				});
				var b = (c, d) => c << 8 | d;
				return a.status === null ? b(0, ((c) => {
					switch (c) {
						case "SIGHUP": return 1;
						case "SIGQUIT": return 3;
						case "SIGFPE": return 8;
						case "SIGKILL": return 9;
						case "SIGALRM": return 14;
						case "SIGTERM": return 15;
						default: return 2;
					}
				})(a.signal)) : a.status << 8 | 0;
			}
			return a ? -52 : 0;
		},
		_emscripten_throw_longjmp: () => {
			throw new sa();
		},
		_gmtime_js: function(a, b) {
			a = a < -9007199254740992 || a > 9007199254740992 ? NaN : Number(a);
			a = /* @__PURE__ */ new Date(a * 1e3);
			if (isNaN(a.getTime())) return 1;
			A[b >> 2] = a.getUTCSeconds();
			A[b + 4 >> 2] = a.getUTCMinutes();
			A[b + 8 >> 2] = a.getUTCHours();
			A[b + 12 >> 2] = a.getUTCDate();
			A[b + 16 >> 2] = a.getUTCMonth();
			A[b + 20 >> 2] = a.getUTCFullYear() - 1900;
			A[b + 24 >> 2] = a.getUTCDay();
			A[b + 28 >> 2] = (a.getTime() - Date.UTC(a.getUTCFullYear(), 0, 1, 0, 0, 0, 0)) / 864e5 | 0;
			return 0;
		},
		_localtime_js: function(a, b) {
			a = a < -9007199254740992 || a > 9007199254740992 ? NaN : Number(a);
			a = /* @__PURE__ */ new Date(a * 1e3);
			if (isNaN(a.getTime())) return 1;
			A[b >> 2] = a.getSeconds();
			A[b + 4 >> 2] = a.getMinutes();
			A[b + 8 >> 2] = a.getHours();
			A[b + 12 >> 2] = a.getDate();
			A[b + 16 >> 2] = a.getMonth();
			A[b + 20 >> 2] = a.getFullYear() - 1900;
			A[b + 24 >> 2] = a.getDay();
			A[b + 28 >> 2] = (Lb(a.getFullYear()) ? Mb : Nb)[a.getMonth()] + a.getDate() - 1 | 0;
			A[b + 36 >> 2] = -(a.getTimezoneOffset() * 60);
			var c = new Date(a.getFullYear(), 6, 1).getTimezoneOffset(), d = new Date(a.getFullYear(), 0, 1).getTimezoneOffset();
			A[b + 32 >> 2] = (c != d && a.getTimezoneOffset() == Math.min(d, c)) | 0;
			return 0;
		},
		_mktime_js: function(a) {
			var b = (() => {
				var c = new Date(A[a + 20 >> 2] + 1900, A[a + 16 >> 2], A[a + 12 >> 2], A[a + 8 >> 2], A[a + 4 >> 2], A[a >> 2], 0);
				if (isNaN(c.getTime())) return -1;
				var d = A[a + 32 >> 2], f = c.getTimezoneOffset(), h = new Date(c.getFullYear(), 6, 1).getTimezoneOffset(), m = new Date(c.getFullYear(), 0, 1).getTimezoneOffset(), n = Math.min(m, h);
				if (d < 0) d = Number(h != m && n == f);
				else if (d > 0 != (n == f) && (h = Math.max(m, h), c.setTime(c.getTime() + ((d > 0 ? n : h) - f) * 6e4), isNaN(c.getTime()))) return -1;
				A[a + 32 >> 2] = d;
				A[a + 24 >> 2] = c.getDay();
				A[a + 28 >> 2] = (Lb(c.getFullYear()) ? Mb : Nb)[c.getMonth()] + c.getDate() - 1 | 0;
				A[a >> 2] = c.getSeconds();
				A[a + 4 >> 2] = c.getMinutes();
				A[a + 8 >> 2] = c.getHours();
				A[a + 12 >> 2] = c.getDate();
				A[a + 16 >> 2] = c.getMonth();
				A[a + 20 >> 2] = c.getYear();
				return c.getTime() / 1e3;
			})();
			return BigInt(b);
		},
		_tzset_js: (a, b, c, d) => {
			var f = (/* @__PURE__ */ new Date()).getFullYear(), h = new Date(f, 0, 1).getTimezoneOffset();
			f = new Date(f, 6, 1).getTimezoneOffset();
			x[a >> 2] = Math.max(h, f) * 60;
			A[b >> 2] = Number(h != f);
			b = (m) => {
				var n = Math.abs(m);
				return `UTC${m >= 0 ? "-" : "+"}${String(Math.floor(n / 60)).padStart(2, "0")}${String(n % 60).padStart(2, "0")}`;
			};
			a = b(h);
			b = b(f);
			g(a);
			g(b);
			g(N(a) <= 16, `timezone name truncated to fit in TZNAME_MAX (${a})`);
			g(N(b) <= 16, `timezone name truncated to fit in TZNAME_MAX (${b})`);
			f < h ? (X(a, c, 17), X(b, d, 17)) : (X(a, d, 17), X(b, c, 17));
		},
		clock_time_get: function(a, b, c) {
			if (!(a >= 0 && a <= 3)) return 28;
			Ha[c >> 3] = BigInt(Math.round((a === 0 ? Date.now() : performance.now()) * 1e6));
			return 0;
		},
		emscripten_date_now: () => Date.now(),
		emscripten_resize_heap: (a) => {
			var b = Ea.length;
			a >>>= 0;
			g(a > b);
			if (a > 2147483648) return l(`Cannot enlarge memory, requested ${a} bytes, but the limit is 2147483648 bytes!`), !1;
			for (var c = 1; c <= 4; c *= 2) {
				var d = b * (1 + .2 / c);
				d = Math.min(d, a + 100663296);
				var f = Math, h = f.min;
				d = Math.max(a, d);
				g(65536, "alignment argument is required");
				f = h.call(f, 2147483648, Math.ceil(d / 65536) * 65536);
				a: {
					h = f;
					d = Da.buffer.byteLength;
					try {
						Da.grow((h - d + 65535) / 65536 | 0);
						Ca();
						var m = 1;
						break a;
					} catch (n) {
						l(`growMemory: Attempted to grow heap from ${d} bytes to ${h} bytes, but got error: ${n}`);
					}
					m = void 0;
				}
				if (m) return !0;
			}
			l(`Failed to grow the heap from ${b} bytes to ${f} bytes, not enough memory!`);
			return !1;
		},
		environ_get: (a, b) => {
			var c = 0, d = 0, f;
			for (f of Qb()) {
				var h = b + c;
				x[a + d >> 2] = h;
				c += X(f, h, Infinity) + 1;
				d += 4;
			}
			return 0;
		},
		environ_sizes_get: (a, b) => {
			var c = Qb();
			x[a >> 2] = c.length;
			a = 0;
			for (var d of c) a += N(d) + 1;
			x[b >> 2] = a;
			return 0;
		},
		exit: (a, b) => {
			dc();
			!b && l(`program exited (with status: ${a}), but keepRuntimeAlive() is set (counter=0) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`);
			ia(a, new Ma(a));
		},
		fd_close: function(a) {
			try {
				var b = V(a);
				M.close(b);
				return 0;
			} catch (c) {
				if (typeof M == "undefined" || c.name !== "ErrnoError") throw c;
				return c.u;
			}
		},
		fd_read: function(a, b, c, d) {
			try {
				a: {
					var f = V(a);
					a = b;
					for (var h, m = b = 0; m < c; m++) {
						var n = x[a >> 2], w = x[a + 4 >> 2];
						a += 8;
						try {
							var q = M.read(f, y, n, w, h);
						} catch (t) {
							if (b > 0 && t instanceof M.g && (t.u == 6 || t.u == 6)) break;
							throw t;
						}
						if (q < 0) {
							var p = -1;
							break a;
						}
						b += q;
						if (q < w) break;
						typeof h != "undefined" && (h += q);
					}
					p = b;
				}
				x[d >> 2] = p;
				return 0;
			} catch (t) {
				if (typeof M == "undefined" || t.name !== "ErrnoError") throw t;
				return t.u;
			}
		},
		fd_seek: function(a, b, c, d) {
			b = b < -9007199254740992 || b > 9007199254740992 ? NaN : Number(b);
			try {
				if (isNaN(b)) return 22;
				var f = V(a);
				M.A(f, b, c);
				Ha[d >> 3] = BigInt(f.position);
				f.W && !b && c === 0 && (f.W = null);
				return 0;
			} catch (h) {
				if (typeof M == "undefined" || h.name !== "ErrnoError") throw h;
				return h.u;
			}
		},
		fd_write: function(a, b, c, d) {
			try {
				var f = V(a);
				a = b;
				if (c == 1) var h = M.write(f, y, x[a >> 2], x[a + 4 >> 2], void 0);
				else {
					for (var m = b = 0, n = a; m < c; m++, n += 8) b += x[n + 4 >> 2];
					var w = new Uint8Array(b);
					for (m = n = 0; m < c; m++, a += 8) {
						var q = x[a >> 2], p = x[a + 4 >> 2];
						w.set(Ea.subarray(q, q + p), n);
						n += p;
					}
					h = M.write(f, w, 0, b, void 0);
				}
				x[d >> 2] = h;
				return 0;
			} catch (t) {
				if (typeof M == "undefined" || t.name !== "ErrnoError") throw t;
				return t.u;
			}
		},
		invoke_vii: fc
	};
	function fc(a, b, c) {
		var d = Zb();
		try {
			Sb(a)(b, c);
		} catch (f) {
			$b(d);
			if (!(f instanceof ra)) throw f;
			bc(1, 0);
		}
	}
	var ic;
	function dc() {
		var a = k, b = l, c = !1;
		k = l = () => {
			c = !0;
		};
		try {
			Ib(0);
			for (var d of Object.values(Ya)) d.output.length && (c = !0);
		} catch (f) {}
		k = a;
		l = b;
		c && E("stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.");
	}
	var jc = await async function() {
		var a = Module, b = {
			env: hc,
			wasi_snapshot_preview1: hc
		};
		Ia ??= Module.locateFile ? Module.locateFile ? Module.locateFile("liblua5.1.wasm", ka) : ka + "liblua5.1.wasm" : new URL("liblua5.1.wasm", import.meta.url).href;
		b = await La(b);
		g(Module === a, "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?");
		a = jc = b.instance.exports;
		g(typeof a.lua_checkstack != "undefined", "missing Wasm export: lua_checkstack");
		g(typeof a.lua_xmove != "undefined", "missing Wasm export: lua_xmove");
		g(typeof a.lua_atpanic != "undefined", "missing Wasm export: lua_atpanic");
		g(typeof a.lua_newthread != "undefined", "missing Wasm export: lua_newthread");
		g(typeof a.lua_gettop != "undefined", "missing Wasm export: lua_gettop");
		g(typeof a.lua_settop != "undefined", "missing Wasm export: lua_settop");
		g(typeof a.lua_remove != "undefined", "missing Wasm export: lua_remove");
		g(typeof a.lua_insert != "undefined", "missing Wasm export: lua_insert");
		g(typeof a.lua_replace != "undefined", "missing Wasm export: lua_replace");
		g(typeof a.lua_pushvalue != "undefined", "missing Wasm export: lua_pushvalue");
		g(typeof a.lua_type != "undefined", "missing Wasm export: lua_type");
		g(typeof a.lua_typename != "undefined", "missing Wasm export: lua_typename");
		g(typeof a.lua_iscfunction != "undefined", "missing Wasm export: lua_iscfunction");
		g(typeof a.lua_isnumber != "undefined", "missing Wasm export: lua_isnumber");
		g(typeof a.lua_isstring != "undefined", "missing Wasm export: lua_isstring");
		g(typeof a.lua_isuserdata != "undefined", "missing Wasm export: lua_isuserdata");
		g(typeof a.lua_rawequal != "undefined", "missing Wasm export: lua_rawequal");
		g(typeof a.lua_equal != "undefined", "missing Wasm export: lua_equal");
		g(typeof a.lua_lessthan != "undefined", "missing Wasm export: lua_lessthan");
		g(typeof a.lua_tonumber != "undefined", "missing Wasm export: lua_tonumber");
		g(typeof a.lua_tointeger != "undefined", "missing Wasm export: lua_tointeger");
		g(typeof a.lua_toboolean != "undefined", "missing Wasm export: lua_toboolean");
		g(typeof a.lua_tolstring != "undefined", "missing Wasm export: lua_tolstring");
		g(typeof a.lua_objlen != "undefined", "missing Wasm export: lua_objlen");
		g(typeof a.lua_tocfunction != "undefined", "missing Wasm export: lua_tocfunction");
		g(typeof a.lua_touserdata != "undefined", "missing Wasm export: lua_touserdata");
		g(typeof a.lua_tothread != "undefined", "missing Wasm export: lua_tothread");
		g(typeof a.lua_topointer != "undefined", "missing Wasm export: lua_topointer");
		g(typeof a.lua_pushnil != "undefined", "missing Wasm export: lua_pushnil");
		g(typeof a.lua_pushnumber != "undefined", "missing Wasm export: lua_pushnumber");
		g(typeof a.lua_pushinteger != "undefined", "missing Wasm export: lua_pushinteger");
		g(typeof a.lua_pushlstring != "undefined", "missing Wasm export: lua_pushlstring");
		g(typeof a.lua_pushstring != "undefined", "missing Wasm export: lua_pushstring");
		g(typeof a.lua_pushvfstring != "undefined", "missing Wasm export: lua_pushvfstring");
		g(typeof a.lua_pushfstring != "undefined", "missing Wasm export: lua_pushfstring");
		g(typeof a.lua_pushcclosure != "undefined", "missing Wasm export: lua_pushcclosure");
		g(typeof a.lua_pushboolean != "undefined", "missing Wasm export: lua_pushboolean");
		g(typeof a.lua_pushlightuserdata != "undefined", "missing Wasm export: lua_pushlightuserdata");
		g(typeof a.lua_pushthread != "undefined", "missing Wasm export: lua_pushthread");
		g(typeof a.lua_gettable != "undefined", "missing Wasm export: lua_gettable");
		g(typeof a.lua_getfield != "undefined", "missing Wasm export: lua_getfield");
		g(typeof a.lua_rawget != "undefined", "missing Wasm export: lua_rawget");
		g(typeof a.lua_rawgeti != "undefined", "missing Wasm export: lua_rawgeti");
		g(typeof a.lua_createtable != "undefined", "missing Wasm export: lua_createtable");
		g(typeof a.lua_getmetatable != "undefined", "missing Wasm export: lua_getmetatable");
		g(typeof a.lua_getfenv != "undefined", "missing Wasm export: lua_getfenv");
		g(typeof a.lua_settable != "undefined", "missing Wasm export: lua_settable");
		g(typeof a.lua_setfield != "undefined", "missing Wasm export: lua_setfield");
		g(typeof a.lua_rawset != "undefined", "missing Wasm export: lua_rawset");
		g(typeof a.lua_rawseti != "undefined", "missing Wasm export: lua_rawseti");
		g(typeof a.lua_setmetatable != "undefined", "missing Wasm export: lua_setmetatable");
		g(typeof a.lua_setfenv != "undefined", "missing Wasm export: lua_setfenv");
		g(typeof a.lua_call != "undefined", "missing Wasm export: lua_call");
		g(typeof a.lua_pcall != "undefined", "missing Wasm export: lua_pcall");
		g(typeof a.lua_cpcall != "undefined", "missing Wasm export: lua_cpcall");
		g(typeof a.lua_load != "undefined", "missing Wasm export: lua_load");
		g(typeof a.lua_dump != "undefined", "missing Wasm export: lua_dump");
		g(typeof a.lua_status != "undefined", "missing Wasm export: lua_status");
		g(typeof a.lua_gc != "undefined", "missing Wasm export: lua_gc");
		g(typeof a.lua_error != "undefined", "missing Wasm export: lua_error");
		g(typeof a.lua_next != "undefined", "missing Wasm export: lua_next");
		g(typeof a.lua_concat != "undefined", "missing Wasm export: lua_concat");
		g(typeof a.lua_getallocf != "undefined", "missing Wasm export: lua_getallocf");
		g(typeof a.lua_setallocf != "undefined", "missing Wasm export: lua_setallocf");
		g(typeof a.lua_newuserdata != "undefined", "missing Wasm export: lua_newuserdata");
		g(typeof a.lua_getupvalue != "undefined", "missing Wasm export: lua_getupvalue");
		g(typeof a.lua_setupvalue != "undefined", "missing Wasm export: lua_setupvalue");
		g(typeof a.luaL_argerror != "undefined", "missing Wasm export: luaL_argerror");
		g(typeof a.lua_getstack != "undefined", "missing Wasm export: lua_getstack");
		g(typeof a.luaL_error != "undefined", "missing Wasm export: luaL_error");
		g(typeof a.lua_getinfo != "undefined", "missing Wasm export: lua_getinfo");
		g(typeof a.luaL_typerror != "undefined", "missing Wasm export: luaL_typerror");
		g(typeof a.luaL_where != "undefined", "missing Wasm export: luaL_where");
		g(typeof a.luaL_checkoption != "undefined", "missing Wasm export: luaL_checkoption");
		g(typeof a.luaL_optlstring != "undefined", "missing Wasm export: luaL_optlstring");
		g(typeof a.luaL_checklstring != "undefined", "missing Wasm export: luaL_checklstring");
		g(typeof a.luaL_newmetatable != "undefined", "missing Wasm export: luaL_newmetatable");
		g(typeof a.luaL_checkudata != "undefined", "missing Wasm export: luaL_checkudata");
		g(typeof a.luaL_checkstack != "undefined", "missing Wasm export: luaL_checkstack");
		g(typeof a.luaL_checktype != "undefined", "missing Wasm export: luaL_checktype");
		g(typeof a.luaL_checkany != "undefined", "missing Wasm export: luaL_checkany");
		g(typeof a.luaL_checknumber != "undefined", "missing Wasm export: luaL_checknumber");
		g(typeof a.luaL_optnumber != "undefined", "missing Wasm export: luaL_optnumber");
		g(typeof a.luaL_checkinteger != "undefined", "missing Wasm export: luaL_checkinteger");
		g(typeof a.luaL_optinteger != "undefined", "missing Wasm export: luaL_optinteger");
		g(typeof a.luaL_getmetafield != "undefined", "missing Wasm export: luaL_getmetafield");
		g(typeof a.luaL_callmeta != "undefined", "missing Wasm export: luaL_callmeta");
		g(typeof a.luaL_register != "undefined", "missing Wasm export: luaL_register");
		g(typeof a.luaL_gsub != "undefined", "missing Wasm export: luaL_gsub");
		g(typeof a.luaL_prepbuffer != "undefined", "missing Wasm export: luaL_prepbuffer");
		g(typeof a.luaL_buffinit != "undefined", "missing Wasm export: luaL_buffinit");
		g(typeof a.luaL_addlstring != "undefined", "missing Wasm export: luaL_addlstring");
		g(typeof a.luaL_addstring != "undefined", "missing Wasm export: luaL_addstring");
		g(typeof a.luaL_pushresult != "undefined", "missing Wasm export: luaL_pushresult");
		g(typeof a.luaL_addvalue != "undefined", "missing Wasm export: luaL_addvalue");
		g(typeof a.luaL_ref != "undefined", "missing Wasm export: luaL_ref");
		g(typeof a.luaL_unref != "undefined", "missing Wasm export: luaL_unref");
		g(typeof a.luaL_loadfile != "undefined", "missing Wasm export: luaL_loadfile");
		g(typeof a.strerror != "undefined", "missing Wasm export: strerror");
		g(typeof a.luaL_loadbuffer != "undefined", "missing Wasm export: luaL_loadbuffer");
		g(typeof a.luaL_loadstring != "undefined", "missing Wasm export: luaL_loadstring");
		g(typeof a.luaL_newstate != "undefined", "missing Wasm export: luaL_newstate");
		g(typeof a.lua_newstate != "undefined", "missing Wasm export: lua_newstate");
		g(typeof a.free != "undefined", "missing Wasm export: free");
		g(typeof a.realloc != "undefined", "missing Wasm export: realloc");
		g(typeof a.luaopen_base != "undefined", "missing Wasm export: luaopen_base");
		g(typeof a.lua_yield != "undefined", "missing Wasm export: lua_yield");
		g(typeof a.lua_resume != "undefined", "missing Wasm export: lua_resume");
		g(typeof a.luaopen_debug != "undefined", "missing Wasm export: luaopen_debug");
		g(typeof a.lua_gethookmask != "undefined", "missing Wasm export: lua_gethookmask");
		g(typeof a.lua_gethook != "undefined", "missing Wasm export: lua_gethook");
		g(typeof a.lua_gethookcount != "undefined", "missing Wasm export: lua_gethookcount");
		g(typeof a.lua_getlocal != "undefined", "missing Wasm export: lua_getlocal");
		g(typeof a.lua_sethook != "undefined", "missing Wasm export: lua_sethook");
		g(typeof a.lua_setlocal != "undefined", "missing Wasm export: lua_setlocal");
		g(typeof a.luaL_openlibs != "undefined", "missing Wasm export: luaL_openlibs");
		g(typeof a.luaopen_package != "undefined", "missing Wasm export: luaopen_package");
		g(typeof a.luaopen_table != "undefined", "missing Wasm export: luaopen_table");
		g(typeof a.luaopen_io != "undefined", "missing Wasm export: luaopen_io");
		g(typeof a.luaopen_os != "undefined", "missing Wasm export: luaopen_os");
		g(typeof a.luaopen_string != "undefined", "missing Wasm export: luaopen_string");
		g(typeof a.luaopen_math != "undefined", "missing Wasm export: luaopen_math");
		g(typeof a.fflush != "undefined", "missing Wasm export: fflush");
		g(typeof a.lua_close != "undefined", "missing Wasm export: lua_close");
		g(typeof a.malloc != "undefined", "missing Wasm export: malloc");
		g(typeof a.setThrew != "undefined", "missing Wasm export: setThrew");
		g(typeof a.emscripten_stack_init != "undefined", "missing Wasm export: emscripten_stack_init");
		g(typeof a.emscripten_stack_get_free != "undefined", "missing Wasm export: emscripten_stack_get_free");
		g(typeof a.emscripten_stack_get_base != "undefined", "missing Wasm export: emscripten_stack_get_base");
		g(typeof a.emscripten_stack_get_end != "undefined", "missing Wasm export: emscripten_stack_get_end");
		g(typeof a._emscripten_stack_restore != "undefined", "missing Wasm export: _emscripten_stack_restore");
		g(typeof a._emscripten_stack_alloc != "undefined", "missing Wasm export: _emscripten_stack_alloc");
		g(typeof a.emscripten_stack_get_current != "undefined", "missing Wasm export: emscripten_stack_get_current");
		g(typeof a.memory != "undefined", "missing Wasm export: memory");
		g(typeof a.__indirect_function_table != "undefined", "missing Wasm export: __indirect_function_table");
		Module._lua_checkstack = C("lua_checkstack", a.lua_checkstack, 2);
		Module._lua_xmove = C("lua_xmove", a.lua_xmove, 3);
		Module._lua_atpanic = C("lua_atpanic", a.lua_atpanic, 2);
		Module._lua_newthread = C("lua_newthread", a.lua_newthread, 1);
		Module._lua_gettop = C("lua_gettop", a.lua_gettop, 1);
		Module._lua_settop = C("lua_settop", a.lua_settop, 2);
		Module._lua_remove = C("lua_remove", a.lua_remove, 2);
		Module._lua_insert = C("lua_insert", a.lua_insert, 2);
		Module._lua_replace = C("lua_replace", a.lua_replace, 2);
		Module._lua_pushvalue = C("lua_pushvalue", a.lua_pushvalue, 2);
		Module._lua_type = C("lua_type", a.lua_type, 2);
		Module._lua_typename = C("lua_typename", a.lua_typename, 2);
		Module._lua_iscfunction = C("lua_iscfunction", a.lua_iscfunction, 2);
		Module._lua_isnumber = C("lua_isnumber", a.lua_isnumber, 2);
		Module._lua_isstring = C("lua_isstring", a.lua_isstring, 2);
		Module._lua_isuserdata = C("lua_isuserdata", a.lua_isuserdata, 2);
		Module._lua_rawequal = C("lua_rawequal", a.lua_rawequal, 3);
		Module._lua_equal = C("lua_equal", a.lua_equal, 3);
		Module._lua_lessthan = C("lua_lessthan", a.lua_lessthan, 3);
		Module._lua_tonumber = C("lua_tonumber", a.lua_tonumber, 2);
		Module._lua_tointeger = C("lua_tointeger", a.lua_tointeger, 2);
		Module._lua_toboolean = C("lua_toboolean", a.lua_toboolean, 2);
		Module._lua_tolstring = C("lua_tolstring", a.lua_tolstring, 3);
		Module._lua_objlen = C("lua_objlen", a.lua_objlen, 2);
		Module._lua_tocfunction = C("lua_tocfunction", a.lua_tocfunction, 2);
		Module._lua_touserdata = C("lua_touserdata", a.lua_touserdata, 2);
		Module._lua_tothread = C("lua_tothread", a.lua_tothread, 2);
		Module._lua_topointer = C("lua_topointer", a.lua_topointer, 2);
		Module._lua_pushnil = C("lua_pushnil", a.lua_pushnil, 1);
		Module._lua_pushnumber = C("lua_pushnumber", a.lua_pushnumber, 2);
		Module._lua_pushinteger = C("lua_pushinteger", a.lua_pushinteger, 2);
		Module._lua_pushlstring = C("lua_pushlstring", a.lua_pushlstring, 3);
		Module._lua_pushstring = C("lua_pushstring", a.lua_pushstring, 2);
		Module._lua_pushvfstring = C("lua_pushvfstring", a.lua_pushvfstring, 3);
		Module._lua_pushfstring = C("lua_pushfstring", a.lua_pushfstring, 3);
		Module._lua_pushcclosure = C("lua_pushcclosure", a.lua_pushcclosure, 3);
		Module._lua_pushboolean = C("lua_pushboolean", a.lua_pushboolean, 2);
		Module._lua_pushlightuserdata = C("lua_pushlightuserdata", a.lua_pushlightuserdata, 2);
		Module._lua_pushthread = C("lua_pushthread", a.lua_pushthread, 1);
		Module._lua_gettable = C("lua_gettable", a.lua_gettable, 2);
		Module._lua_getfield = C("lua_getfield", a.lua_getfield, 3);
		Module._lua_rawget = C("lua_rawget", a.lua_rawget, 2);
		Module._lua_rawgeti = C("lua_rawgeti", a.lua_rawgeti, 3);
		Module._lua_createtable = C("lua_createtable", a.lua_createtable, 3);
		Module._lua_getmetatable = C("lua_getmetatable", a.lua_getmetatable, 2);
		Module._lua_getfenv = C("lua_getfenv", a.lua_getfenv, 2);
		Module._lua_settable = C("lua_settable", a.lua_settable, 2);
		Module._lua_setfield = C("lua_setfield", a.lua_setfield, 3);
		Module._lua_rawset = C("lua_rawset", a.lua_rawset, 2);
		Module._lua_rawseti = C("lua_rawseti", a.lua_rawseti, 3);
		Module._lua_setmetatable = C("lua_setmetatable", a.lua_setmetatable, 2);
		Module._lua_setfenv = C("lua_setfenv", a.lua_setfenv, 2);
		Module._lua_call = C("lua_call", a.lua_call, 3);
		Module._lua_pcall = C("lua_pcall", a.lua_pcall, 4);
		Module._lua_cpcall = C("lua_cpcall", a.lua_cpcall, 3);
		Module._lua_load = C("lua_load", a.lua_load, 4);
		Module._lua_dump = C("lua_dump", a.lua_dump, 3);
		Module._lua_status = C("lua_status", a.lua_status, 1);
		Module._lua_gc = C("lua_gc", a.lua_gc, 3);
		Module._lua_error = C("lua_error", a.lua_error, 1);
		Module._lua_next = C("lua_next", a.lua_next, 2);
		Module._lua_concat = C("lua_concat", a.lua_concat, 2);
		Module._lua_getallocf = C("lua_getallocf", a.lua_getallocf, 2);
		Module._lua_setallocf = C("lua_setallocf", a.lua_setallocf, 3);
		Module._lua_newuserdata = C("lua_newuserdata", a.lua_newuserdata, 2);
		Module._lua_getupvalue = C("lua_getupvalue", a.lua_getupvalue, 3);
		Module._lua_setupvalue = C("lua_setupvalue", a.lua_setupvalue, 3);
		Module._luaL_argerror = C("luaL_argerror", a.luaL_argerror, 3);
		Module._lua_getstack = C("lua_getstack", a.lua_getstack, 3);
		Module._luaL_error = C("luaL_error", a.luaL_error, 3);
		Module._lua_getinfo = C("lua_getinfo", a.lua_getinfo, 3);
		Module._luaL_typerror = C("luaL_typerror", a.luaL_typerror, 3);
		Module._luaL_where = C("luaL_where", a.luaL_where, 2);
		Module._luaL_checkoption = C("luaL_checkoption", a.luaL_checkoption, 4);
		Module._luaL_optlstring = C("luaL_optlstring", a.luaL_optlstring, 4);
		Module._luaL_checklstring = C("luaL_checklstring", a.luaL_checklstring, 3);
		Module._luaL_newmetatable = C("luaL_newmetatable", a.luaL_newmetatable, 2);
		Module._luaL_checkudata = C("luaL_checkudata", a.luaL_checkudata, 3);
		Module._luaL_checkstack = C("luaL_checkstack", a.luaL_checkstack, 3);
		Module._luaL_checktype = C("luaL_checktype", a.luaL_checktype, 3);
		Module._luaL_checkany = C("luaL_checkany", a.luaL_checkany, 2);
		Module._luaL_checknumber = C("luaL_checknumber", a.luaL_checknumber, 2);
		Module._luaL_optnumber = C("luaL_optnumber", a.luaL_optnumber, 3);
		Module._luaL_checkinteger = C("luaL_checkinteger", a.luaL_checkinteger, 2);
		Module._luaL_optinteger = C("luaL_optinteger", a.luaL_optinteger, 3);
		Module._luaL_getmetafield = C("luaL_getmetafield", a.luaL_getmetafield, 3);
		Module._luaL_callmeta = C("luaL_callmeta", a.luaL_callmeta, 3);
		Module._luaL_register = C("luaL_register", a.luaL_register, 3);
		Module._luaL_gsub = C("luaL_gsub", a.luaL_gsub, 4);
		Module._luaL_prepbuffer = C("luaL_prepbuffer", a.luaL_prepbuffer, 1);
		Module._luaL_buffinit = C("luaL_buffinit", a.luaL_buffinit, 2);
		Module._luaL_addlstring = C("luaL_addlstring", a.luaL_addlstring, 3);
		Module._luaL_addstring = C("luaL_addstring", a.luaL_addstring, 2);
		Module._luaL_pushresult = C("luaL_pushresult", a.luaL_pushresult, 1);
		Module._luaL_addvalue = C("luaL_addvalue", a.luaL_addvalue, 1);
		Module._luaL_ref = C("luaL_ref", a.luaL_ref, 2);
		Module._luaL_unref = C("luaL_unref", a.luaL_unref, 3);
		Module._luaL_loadfile = C("luaL_loadfile", a.luaL_loadfile, 2);
		Hb = C("strerror", a.strerror, 1);
		Module._luaL_loadbuffer = C("luaL_loadbuffer", a.luaL_loadbuffer, 4);
		Module._luaL_loadstring = C("luaL_loadstring", a.luaL_loadstring, 2);
		Module._luaL_newstate = C("luaL_newstate", a.luaL_newstate, 0);
		Module._lua_newstate = C("lua_newstate", a.lua_newstate, 2);
		Module._free = C("free", a.free, 1);
		Module._realloc = C("realloc", a.realloc, 2);
		Module._luaopen_base = C("luaopen_base", a.luaopen_base, 1);
		Module._lua_yield = C("lua_yield", a.lua_yield, 2);
		Module._lua_resume = C("lua_resume", a.lua_resume, 2);
		Module._luaopen_debug = C("luaopen_debug", a.luaopen_debug, 1);
		Module._lua_gethookmask = C("lua_gethookmask", a.lua_gethookmask, 1);
		Module._lua_gethook = C("lua_gethook", a.lua_gethook, 1);
		Module._lua_gethookcount = C("lua_gethookcount", a.lua_gethookcount, 1);
		Module._lua_getlocal = C("lua_getlocal", a.lua_getlocal, 3);
		Module._lua_sethook = C("lua_sethook", a.lua_sethook, 4);
		Module._lua_setlocal = C("lua_setlocal", a.lua_setlocal, 3);
		Module._luaL_openlibs = C("luaL_openlibs", a.luaL_openlibs, 1);
		Module._luaopen_package = C("luaopen_package", a.luaopen_package, 1);
		Module._luaopen_table = C("luaopen_table", a.luaopen_table, 1);
		Module._luaopen_io = C("luaopen_io", a.luaopen_io, 1);
		Module._luaopen_os = C("luaopen_os", a.luaopen_os, 1);
		Module._luaopen_string = C("luaopen_string", a.luaopen_string, 1);
		Module._luaopen_math = C("luaopen_math", a.luaopen_math, 1);
		Ib = C("fflush", a.fflush, 1);
		Module._lua_close = C("lua_close", a.lua_close, 1);
		ac = Module._malloc = C("malloc", a.malloc, 1);
		bc = C("setThrew", a.setThrew, 2);
		cc = a.emscripten_stack_init;
		za = a.emscripten_stack_get_end;
		$b = a._emscripten_stack_restore;
		Yb = a._emscripten_stack_alloc;
		Zb = a.emscripten_stack_get_current;
		Da = a.memory;
		Y = a.__indirect_function_table;
		Ca();
		return jc;
	}();
	await async function() {
		g(!ic);
		ic = !0;
		cc();
		var a = za();
		g((a & 3) == 0);
		a == 0 && (a += 4);
		x[a >> 2] = 34821223;
		x[a + 4 >> 2] = 2310721022;
		x[0] = 1668509029;
		if (a = Module.preRun) typeof a == "function" && (a = [a]), Na.push(...a);
		for (va(); Na.length > 0;) Na.shift()(Module);
		lb && await kb();
		qa || (g(!Ba), Ba = !0, ya(), Module.noFSInit || M.U || M.init(), jc.__wasm_call_ctors(), M.ka = !1, ya(), g(!Module._main, "compiled without a main, but one is present. if you added it from JS, use Module[\"onRuntimeInitialized\"]"), ya());
	}();
	for (let a of Object.keys(Module)) a in moduleArg || Object.defineProperty(moduleArg, a, {
		configurable: !0,
		get() {
			r(`Access to module property ('${a}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.`);
		}
	});
	return Module;
}
//#endregion
//#region src/api.ts
var LuaApi = class LuaApi {
	static async initialize(customWasmFileLocation, environmentVariables) {
		const module = await initWasmModule({
			locateFile: (path, scriptDirectory) => {
				return customWasmFileLocation || scriptDirectory + path;
			},
			preRun: (initializedModule) => {
				if (typeof environmentVariables === "object") Object.entries(environmentVariables).forEach(([k, v]) => initializedModule.ENV[k] = v);
			}
		});
		return new LuaApi(module);
	}
	constructor(module) {
		this.pointerRefs = /* @__PURE__ */ new Map();
		this.referenceTracker = /* @__PURE__ */ new WeakMap();
		this.referenceMap = /* @__PURE__ */ new Map();
		this.availableReferences = [];
		this.module = module;
		this.luaL_error = this.cwrap("luaL_error", null, ["number", "string"]);
		this.luaL_argerror = this.cwrap("luaL_argerror", "number", [
			"number",
			"number",
			"string"
		]);
		this.luaL_typerror = this.cwrap("luaL_typerror", "number", [
			"number",
			"number",
			"string"
		]);
		this.luaL_addlstring = this.cwrap("luaL_addlstring", null, [
			"number",
			"string",
			"number"
		]);
		this.luaL_addstring = this.cwrap("luaL_addstring", null, ["number", "string"]);
		this.luaL_addvalue = this.cwrap("luaL_addvalue", null, ["number"]);
		this.luaL_checkany = this.cwrap("luaL_checkany", null, ["number", "number"]);
		this.luaL_checkinteger = this.cwrap("luaL_checkinteger", "number", ["number", "number"]);
		this.luaL_checklstring = this.cwrap("luaL_checklstring", "string", [
			"number",
			"number",
			"number"
		]);
		this.luaL_checknumber = this.cwrap("luaL_checknumber", "number", ["number", "number"]);
		this.luaL_checkstack = this.cwrap("luaL_checkstack", null, [
			"number",
			"number",
			"string"
		]);
		this.luaL_checktype = this.cwrap("luaL_checktype", null, [
			"number",
			"number",
			"number"
		]);
		this.luaL_checkudata = this.cwrap("luaL_checkudata", "number", [
			"number",
			"number",
			"string"
		]);
		this.luaL_loadbuffer = this.cwrap("luaL_loadbuffer", "number", [
			"number",
			"string|number",
			"number",
			"string|number"
		]);
		this.luaL_loadfile = this.cwrap("luaL_loadfile", "number", ["number", "string"]);
		this.luaL_loadfilex = (state, filename) => this.luaL_loadfile(state, filename);
		this.luaL_loadstring = this.cwrap("luaL_loadstring", "number", ["number", "string"]);
		this.luaL_buffinit = this.cwrap("luaL_buffinit", null, ["number", "number"]);
		this.luaL_callmeta = this.cwrap("luaL_callmeta", "number", [
			"number",
			"number",
			"string"
		]);
		this.luaL_getmetafield = this.cwrap("luaL_getmetafield", "number", [
			"number",
			"number",
			"string"
		]);
		this.luaL_gsub = this.cwrap("luaL_gsub", "string", [
			"number",
			"string",
			"string",
			"string"
		]);
		this.luaL_newmetatable = this.cwrap("luaL_newmetatable", "number", ["number", "string"]);
		this.luaL_newstate = this.cwrap("luaL_newstate", "number", []);
		this.luaL_openlibs = this.cwrap("luaL_openlibs", null, ["number"]);
		this.luaL_optinteger = this.cwrap("luaL_optinteger", "number", [
			"number",
			"number",
			"number"
		]);
		this.luaL_optlstring = this.cwrap("luaL_optlstring", "string", [
			"number",
			"number",
			"string",
			"number"
		]);
		this.luaL_optnumber = this.cwrap("luaL_optnumber", "number", [
			"number",
			"number",
			"number"
		]);
		this.luaL_prepbuffer = this.cwrap("luaL_prepbuffer", "string", ["number", "number"]);
		this.luaL_pushresult = this.cwrap("luaL_pushresult", null, ["number"]);
		this.luaL_pushresultsize = this.cwrap("luaL_pushresultsize", null, ["number", "number"]);
		this.luaL_register = this.cwrap("luaL_register", null, [
			"number",
			"string",
			"array"
		]);
		this.luaL_ref = this.cwrap("luaL_ref", "number", ["number", "number"]);
		this.luaL_unref = this.cwrap("luaL_unref", null, [
			"number",
			"number",
			"number"
		]);
		this.luaL_where = this.cwrap("luaL_where", null, ["number", "number"]);
		this.lua_atpanic = this.cwrap("lua_atpanic", "number", ["number", "number"]);
		this.lua_call = this.cwrap("lua_call", null, [
			"number",
			"number",
			"number"
		]);
		this.lua_checkstack = this.cwrap("lua_checkstack", "number", ["number", "number"]);
		this.lua_close = this.cwrap("lua_close", null, ["number"]);
		this.lua_concat = this.cwrap("lua_concat", null, ["number", "number"]);
		this.lua_createtable = this.cwrap("lua_createtable", null, [
			"number",
			"number",
			"number"
		]);
		this.lua_dump = this.cwrap("lua_dump", "number", [
			"number",
			"number",
			"number",
			"number"
		]);
		this.lua_equal = this.cwrap("lua_equal", "number", [
			"number",
			"number",
			"number"
		]);
		this.lua_error = this.cwrap("lua_error", "number", ["number"]);
		this.lua_gc = this.cwrap("lua_gc", "number", [
			"number",
			"number",
			"number"
		]);
		this.lua_getallocf = this.cwrap("lua_getallocf", "number", ["number", "number"]);
		this.lua_getfenv = this.cwrap("lua_getfenv", null, ["number", "number"]);
		this.lua_getfield = this.cwrap("lua_getfield", null, [
			"number",
			"number",
			"string"
		]);
		this.lua_gethook = this.cwrap("lua_gethook", "number", ["number"]);
		this.lua_gethookcount = this.cwrap("lua_gethookcount", "number", ["number"]);
		this.lua_gethookmask = this.cwrap("lua_gethookmask", "number", ["number"]);
		this.lua_getinfo = this.cwrap("lua_getinfo", "number", [
			"number",
			"string",
			"number"
		]);
		this.lua_getlocal = this.cwrap("lua_getlocal", "string", [
			"number",
			"number",
			"number"
		]);
		this.lua_getmetatable = this.cwrap("lua_getmetatable", "number", ["number", "number"]);
		this.lua_getstack = this.cwrap("lua_getstack", "number", [
			"number",
			"number",
			"number"
		]);
		this.lua_gettable = this.cwrap("lua_gettable", "number", ["number", "number"]);
		this.lua_gettop = this.cwrap("lua_gettop", "number", ["number"]);
		this.lua_getupvalue = this.cwrap("lua_getupvalue", "string", [
			"number",
			"number",
			"number"
		]);
		this.lua_insert = this.cwrap("lua_insert", null, ["number", "number"]);
		this.lua_lessthan = this.cwrap("lua_lessthan", "number", [
			"number",
			"number",
			"number"
		]);
		this.lua_load = this.cwrap("lua_load", "number", [
			"number",
			"number",
			"number",
			"string",
			"string"
		]);
		this.lua_newstate = this.cwrap("lua_newstate", "number", ["number", "number"]);
		this.lua_newthread = this.cwrap("lua_newthread", "number", ["number"]);
		this.lua_newuserdata = this.cwrap("lua_newuserdata", "number", ["number", "number"]);
		this.lua_next = this.cwrap("lua_next", "number", ["number", "number"]);
		this.lua_objlen = this.cwrap("lua_objlen", "number", ["number", "number"]);
		this.lua_pcall = this.cwrap("lua_pcall", "number", [
			"number",
			"number",
			"number",
			"number"
		]);
		this.lua_iscfunction = this.cwrap("lua_iscfunction", "number", ["number", "number"]);
		this.lua_isnumber = this.cwrap("lua_isnumber", "number", ["number", "number"]);
		this.lua_isstring = this.cwrap("lua_isstring", "number", ["number", "number"]);
		this.lua_isuserdata = this.cwrap("lua_isuserdata", "number", ["number", "number"]);
		this.lua_pushboolean = this.cwrap("lua_pushboolean", null, ["number", "number"]);
		this.lua_pushcclosure = this.cwrap("lua_pushcclosure", null, [
			"number",
			"number",
			"number"
		]);
		this.lua_pushcfunction = (...args) => this.lua_pushcclosure(...args, 0);
		this.lua_pushfstring = this.cwrap("lua_pushfstring", "string", [
			"number",
			"string",
			"array"
		]);
		this.lua_pushinteger = this.cwrap("lua_pushinteger", null, ["number", "number"]);
		this.lua_pushlightuserdata = this.cwrap("lua_pushlightuserdata", null, ["number", "number"]);
		this.lua_pushnil = this.cwrap("lua_pushnil", null, ["number"]);
		this.lua_pushnumber = this.cwrap("lua_pushnumber", null, ["number", "number"]);
		this.lua_pushlstring = this.cwrap("lua_pushlstring", null, [
			"number",
			"string|number",
			"number"
		]);
		this.lua_pushstring = this.cwrap("lua_pushstring", null, ["number", "string|number"]);
		this.lua_pushthread = this.cwrap("lua_pushthread", "number", ["number"]);
		this.lua_pushvalue = this.cwrap("lua_pushvalue", null, ["number", "number"]);
		this.lua_pushvfstring = this.cwrap("lua_pushvfstring", "string", [
			"number",
			"string",
			"number"
		]);
		this.lua_toboolean = this.cwrap("lua_toboolean", "number", ["number", "number"]);
		this.lua_tocfunction = this.cwrap("lua_tocfunction", "number", ["number", "number"]);
		this.lua_tointeger = this.cwrap("lua_tointeger", "number", ["number", "number"]);
		this.lua_tolstring = this.cwrap("lua_tolstring", "string", [
			"number",
			"number",
			"number"
		]);
		this.lua_tostring = (...args) => this.lua_tolstring(...args, null);
		this.lua_tonumber = this.cwrap("lua_tonumber", "number", ["number", "number"]);
		this.lua_topointer = this.cwrap("lua_topointer", "number", ["number", "number"]);
		this.lua_tothread = this.cwrap("lua_tothread", "number", ["number", "number"]);
		this.lua_touserdata = this.cwrap("lua_touserdata", "number", ["number", "number"]);
		this.lua_rawequal = this.cwrap("lua_rawequal", "number", [
			"number",
			"number",
			"number"
		]);
		this.lua_rawget = this.cwrap("lua_rawget", "number", ["number", "number"]);
		this.lua_rawgeti = this.cwrap("lua_rawgeti", "number", [
			"number",
			"number",
			"number"
		]);
		this.lua_rawset = this.cwrap("lua_rawset", null, ["number", "number"]);
		this.lua_rawseti = this.cwrap("lua_rawseti", null, [
			"number",
			"number",
			"number"
		]);
		this.lua_remove = this.cwrap("lua_remove", null, ["number", "number"]);
		this.lua_replace = this.cwrap("lua_replace", null, ["number", "number"]);
		this.lua_resume = this.cwrap("lua_resume", "number", ["number", "number"]);
		this.lua_setallocf = this.cwrap("lua_setallocf", null, [
			"number",
			"number",
			"number"
		]);
		this.lua_setfenv = this.cwrap("lua_setfenv", "number", ["number", "number"]);
		this.lua_setfield = this.cwrap("lua_setfield", null, [
			"number",
			"number",
			"string"
		]);
		this.lua_sethook = this.cwrap("lua_sethook", null, [
			"number",
			"number",
			"number",
			"number"
		]);
		this.lua_setlocal = this.cwrap("lua_setlocal", "string", [
			"number",
			"number",
			"number"
		]);
		this.lua_setmetatable = this.cwrap("lua_setmetatable", "number", ["number", "number"]);
		this.lua_settable = this.cwrap("lua_settable", null, ["number", "number"]);
		this.lua_settop = this.cwrap("lua_settop", null, ["number", "number"]);
		this.lua_setupvalue = this.cwrap("lua_setupvalue", "string", [
			"number",
			"number",
			"number"
		]);
		this.lua_status = this.cwrap("lua_status", "number", ["number"]);
		this.lua_type = this.cwrap("lua_type", "number", ["number", "number"]);
		this.lua_typename = this.cwrap("lua_typename", "string", ["number", "number"]);
		this.lua_xmove = this.cwrap("lua_xmove", null, [
			"number",
			"number",
			"number"
		]);
		this.lua_yield = this.cwrap("lua_yield", "number", ["number", "number"]);
		this.luaopen_base = this.cwrap("luaopen_base", "number", ["number"]);
		this.luaopen_table = this.cwrap("luaopen_table", "number", ["number"]);
		this.luaopen_io = this.cwrap("luaopen_io", "number", ["number"]);
		this.luaopen_os = this.cwrap("luaopen_os", "number", ["number"]);
		this.luaopen_string = this.cwrap("luaopen_string", "number", ["number"]);
		this.luaopen_math = this.cwrap("luaopen_math", "number", ["number"]);
		this.luaopen_debug = this.cwrap("luaopen_debug", "number", ["number"]);
		this.luaopen_package = this.cwrap("luaopen_package", "number", ["number"]);
	}
	lua_absindex(L, idx) {
		return idx > 0 || idx <= -1e4 ? idx : this.lua_gettop(L) + idx + 1;
	}
	lua_setglobal(L, name) {
		this.lua_setfield(L, LUA_GLOBALSINDEX, name);
	}
	lua_getglobal(L, name) {
		this.lua_getfield(L, LUA_GLOBALSINDEX, name);
		return this.lua_type(L, -1);
	}
	lua_pop(L, n) {
		this.lua_settop(L, -n - 1);
	}
	luaL_getmetatable(L, tname) {
		this.lua_getfield(L, LUA_REGISTRYINDEX, tname);
		return this.lua_type(L, -1);
	}
	luaL_typename(L, idx) {
		return this.lua_typename(L, this.lua_type(L, idx));
	}
	luaL_tolstring(L, idx) {
		idx = this.lua_absindex(L, idx);
		let result;
		if (this.luaL_callmeta(L, idx, "__tostring")) {
			if (!this.lua_isstring(L, -1)) this.luaL_error(L, "'__tostring' must return a string");
			result = this.luaL_tolstring(L, -1);
		} else {
			const type = this.lua_type(L, idx);
			if (type === 3) result = `${this.lua_tonumber(L, idx)}`;
			else if (type === 4) result = this.lua_tostring(L, idx);
			else if (type === 1) result = this.lua_toboolean(L, idx) ? "true" : "false";
			else if (type === 0) result = "nil";
			else {
				const tt = this.luaL_getmetafield(L, idx, "__name");
				const kind = tt === 4 ? this.lua_tostring(L, -1) : this.luaL_typename(L, idx);
				if (tt !== 0) this.lua_remove(L, -2);
				result = `${kind}: 0x${this.lua_topointer(L, idx).toString(16)}`;
			}
		}
		this.lua_pushstring(L, result);
		return result;
	}
	lua_upvalueindex(index) {
		return LUA_GLOBALSINDEX - index;
	}
	ref(data) {
		const existing = this.referenceTracker.get(data);
		if (existing) {
			existing.refCount++;
			return existing.index;
		}
		const availableIndex = this.availableReferences.pop();
		const index = availableIndex === void 0 ? this.referenceMap.size + 1 : availableIndex;
		this.referenceMap.set(index, data);
		this.referenceTracker.set(data, {
			refCount: 1,
			index
		});
		this.lastRefIndex = index;
		return index;
	}
	unref(index) {
		const ref = this.referenceMap.get(index);
		if (ref === void 0) return;
		const metadata = this.referenceTracker.get(ref);
		if (metadata === void 0) {
			this.referenceTracker.delete(ref);
			this.availableReferences.push(index);
			return;
		}
		metadata.refCount--;
		if (metadata.refCount <= 0) {
			this.referenceTracker.delete(ref);
			this.referenceMap.delete(index);
			this.availableReferences.push(index);
		}
	}
	getRef(index) {
		return this.referenceMap.get(index);
	}
	getLastRefIndex() {
		return this.lastRefIndex;
	}
	printRefs() {
		for (const [key, value] of this.referenceMap.entries()) console.log(key, value);
	}
	cwrap(name, returnType, argTypes) {
		const commonType = [
			"number",
			"string",
			"array",
			"boolean"
		];
		if (argTypes.every((argType) => commonType.includes(argType))) return (...args) => {
			return this.module.ccall(name, returnType, argTypes, args);
		};
		return (...args) => {
			const pointersToBeFreed = [];
			const resolvedArgTypes = [];
			const resolvedArgs = [];
			argTypes.forEach((argType, i) => {
				if (commonType.includes(argType)) {
					resolvedArgTypes.push(argType);
					resolvedArgs.push(args[i]);
				} else if (argType === "string|number") {
					if (typeof args[i] === "number") {
						resolvedArgTypes.push("number");
						resolvedArgs.push(args[i]);
					} else if (args[i]?.length > 1024) {
						const bufferPointer = this.module.stringToNewUTF8(args[i]);
						resolvedArgTypes.push("number");
						resolvedArgs.push(bufferPointer);
						pointersToBeFreed.push(bufferPointer);
					} else {
						resolvedArgTypes.push("string");
						resolvedArgs.push(args[i]);
					}
				}
			});
			try {
				return this.module.ccall(name, returnType, resolvedArgTypes, resolvedArgs);
			} finally {
				for (const pointer of pointersToBeFreed) this.module._free(pointer);
			}
		};
	}
};
//#endregion
//#region src/func-manager.ts
var FuncManager = class {
	constructor(luaApi) {
		this.pointerRedirect = /* @__PURE__ */ new Map();
		this.indexMap = /* @__PURE__ */ new Map();
		this.gc = 0;
		this.call = 0;
		this.func_call = 0;
		this.index = 0;
		this.new_index = 0;
		this.to_string = 0;
		this.luaApi = luaApi;
	}
	/**
	* 注册gc函数
	* @param thread
	* @returns
	*/
	registerGcFunction(thread) {
		if (this.gc) return this.gc;
		const pointer = thread.luaApi.module.addFunction((L) => {
			const callThread = thread.stateToThread(L);
			const userdata = callThread.luaApi.lua_touserdata(L, 1);
			const pointer = callThread.luaApi.lua_topointer(L, 1);
			const functionPointer = this.pointerRedirect.get(pointer);
			this.removeIndexRedirect(functionPointer);
			const ref = callThread.luaApi.module.getValue(userdata, "*");
			thread.luaApi.unref(ref);
			callThread.luaApi.lua_getmetatable(L, 1);
			if (callThread.luaApi.lua_type(L, -1) === 0) {
				callThread.luaApi.lua_pop(L, 1);
				return 0;
			}
			callThread.luaApi.lua_getfield(L, -1, "__func_pointers");
			if (callThread.luaApi.lua_type(L, -1) !== 5) {
				callThread.luaApi.lua_pop(L, 2);
				return 0;
			}
			callThread.luaApi.lua_pushnil(L);
			while (callThread.luaApi.lua_next(L, -2) !== 0) {
				const funcPointer = callThread.luaApi.lua_tonumber(L, -1);
				callThread.luaApi.module.removeFunction(funcPointer);
				callThread.luaApi.lua_pop(L, 1);
			}
			return 0;
		}, "ii");
		this.gc = pointer;
		return pointer;
	}
	/**
	* 注册调用函数，用于传入了一个不是function的值可以直接被调用的情况
	* @param thread
	*/
	registerCallFunction(thread) {
		if (this.call) return this.call;
		const pointer = thread.luaApi.module.addFunction((L) => {
			const callThread = thread.stateToThread(L);
			const top = callThread.getTop();
			const target = callThread.getValue(1);
			const args = [];
			for (let i = 2; i <= top; i++) args.push(callThread.getValue(i));
			try {
				const result = target(...args);
				callThread.pushValue(result);
				return 1;
			} catch (e) {
				if (typeof e?.message === "string") callThread.pushValue(e?.message);
				else callThread.pushValue("Error: An exception occurred during the process of calling a JavaScript function.");
				callThread.luaApi.lua_error(L);
			}
			return 0;
		}, "ii");
		this.call = pointer;
		return pointer;
	}
	/**
	* 注册的调用函数，用于传入一个function，实则被表示为userdata
	* 然后在lua里面将其进行一层包装成为一个closure的情况
	* @param thread
	*/
	registerFuncCallFunction(thread) {
		if (this.func_call) return this.func_call;
		const pointer = thread.luaApi.module.addFunction((L) => {
			const callThread = thread.stateToThread(L);
			const top = callThread.getTop();
			const args = [];
			for (let i = 1; i <= top; i++) args.push(callThread.getValue(i));
			const userdata = callThread.luaApi.lua_touserdata(L, callThread.luaApi.lua_upvalueindex(1));
			const ref = callThread.luaApi.module.getValue(userdata, "*");
			const func = thread.luaApi.getRef(ref);
			try {
				const result = func.apply(thread, args);
				callThread.pushValue(result);
				return 1;
			} catch (e) {
				if (typeof e?.message === "string") callThread.pushValue(e?.message);
				else callThread.pushValue("Error: An exception occurred during the process of calling a JavaScript function.");
				callThread.luaApi.lua_error(L);
			}
			return 0;
		}, "ii");
		this.func_call = pointer;
		return pointer;
	}
	/**
	* 注册一个index函数，支持重定向target
	*/
	registerIndexFunction(thread) {
		if (this.index) return this.index;
		const pointer = thread.luaApi.module.addFunction((L) => {
			const callThread = thread.stateToThread(L);
			const key = callThread.getValue(2);
			const pointer = callThread.luaApi.lua_topointer(L, 1);
			const target = this.indexMap.get(pointer);
			if (target) {
				const value = target[key];
				callThread.pushValue(typeof value === "function" ? value.bind(target) : value);
				return 1;
			}
			const userdata = callThread.luaApi.lua_touserdata(L, 1);
			const ref = callThread.luaApi.module.getValue(userdata, "*");
			const tar = thread.luaApi.getRef(ref);
			const value = tar?.[key];
			callThread.pushValue(typeof value === "function" ? value.bind(tar) : value);
			return 1;
		}, "ii");
		this.index = pointer;
		return pointer;
	}
	/**
	* 注册一个newindex函数，支持重定向target
	*/
	registerNewIndexFunction(thread) {
		if (this.new_index) return this.new_index;
		const pointer = thread.luaApi.module.addFunction((L) => {
			const callThread = thread.stateToThread(L);
			const key = callThread.getValue(2);
			const value = callThread.getValue(3);
			const pointer = callThread.luaApi.lua_topointer(L, 1);
			const target = this.indexMap.get(pointer);
			if (target) {
				target[key] = value;
				return 0;
			}
			const userdata = callThread.luaApi.lua_touserdata(L, 1);
			const ref = callThread.luaApi.module.getValue(userdata, "*");
			thread.luaApi.getRef(ref)[key] = value;
			return 0;
		}, "ii");
		this.new_index = pointer;
		return pointer;
	}
	/**
	* 注册一个tostring函数，支持重定向target
	*/
	registerToStringFunction(thread) {
		if (this.to_string) return this.to_string;
		const pointer = thread.luaApi.module.addFunction((L) => {
			const callThread = thread.stateToThread(L);
			const pointer = callThread.luaApi.lua_topointer(L, 1);
			const typename = callThread.luaApi.luaL_typename(L, 1);
			const target = this.indexMap.get(pointer);
			if (target) {
				callThread.pushValue(`${typename}: 0x${pointer.toString(16)} -> ${target.toString()}`);
				return 1;
			}
			const userdata = callThread.luaApi.lua_touserdata(L, 1);
			const ref = callThread.luaApi.module.getValue(userdata, "*");
			const value = thread.luaApi.getRef(ref).toString();
			callThread.pushValue(`${typename}: 0x${pointer.toString(16)} -> ${value}`);
			return 1;
		}, "ii");
		this.to_string = pointer;
		return pointer;
	}
	/**
	* 为index以及newindex注册一个重定向。
	* 因为注册lua的function本身是一个closure不包含target的信息。
	* 所以在js层面需要维护这么一个映射关系
	* @param pointer
	* @param target
	*/
	addIndexRedirect(pointer, target) {
		if (!pointer) return;
		this.indexMap.set(pointer, target);
	}
	/**
	* 删除重定向关系，用于gc的时候
	* @param pointer
	*/
	removeIndexRedirect(pointer) {
		if (!pointer) return;
		this.indexMap.delete(pointer);
	}
};
//#endregion
//#region package.json
var version = "1.18.12";
//#endregion
//#region src/context.ts
const getContextProxy = (global) => {
	return new Proxy(global, {
		get: (target, key) => {
			if (key === Symbol.iterator) return { next: () => {
				return 1;
			} };
			if (typeof key === "symbol") return;
			return target.get(key);
		},
		set: (target, key, value) => {
			target.set(key, value);
			return true;
		},
		has: (target, key) => {
			return target.get(key) !== void 0;
		}
	});
};
//#endregion
//#region src/lua.ts
var Lua = class Lua {
	static async create(options = {}) {
		options = {
			openStandardLibs: true,
			traceAllocations: false,
			...options
		};
		if (!options.customWasmUri) {
			if (typeof window === "object" && typeof window.document !== "undefined" || typeof self === "object" && self?.constructor?.name === "DedicatedWorkerGlobalScope") options.customWasmUri = `https://unpkg.com/wasmoon-lua5.1@${version}/dist/liblua5.1.wasm`;
		}
		const luaApi = await LuaApi.initialize(options.customWasmUri, options.environmentVariables);
		return new Lua(luaApi, options);
	}
	constructor(luaApi, options) {
		if (!options) throw new Error("Lua.create(options) must be used to create a Lua instance");
		this.luaApi = luaApi;
		this.global = new LuaGlobal(this.luaApi, options.traceAllocations);
		this.funcManager = new FuncManager(this.luaApi);
		this.initTypeBindings();
		this.ctx = getContextProxy(this.global);
		if (options.openStandardLibs) this.luaApi.luaL_openlibs(this.global.address);
	}
	mountFile(path, content) {
		const fileSep = path.lastIndexOf("/");
		const file = path.substring(fileSep + 1);
		const body = path.substring(0, path.length - file.length - 1);
		if (body.length > 0) {
			const parts = body.split("/").reverse();
			let parent = "";
			while (parts.length) {
				const part = parts.pop();
				if (!part) continue;
				const current = `${parent}/${part}`;
				try {
					this.luaApi.module.FS.mkdir(current);
				} catch (err) {}
				parent = current;
			}
		}
		this.luaApi.module.FS.writeFile(path, content);
	}
	unmountFile(path) {
		this.luaApi.module.FS.unlink(path);
	}
	doString(script) {
		return this.callByteCode((thread) => thread.loadString(script));
	}
	/** Bind an asynchronous JS operation for calls from doString/doFile.
	* The Lua wrapper yields after the native JS callback has returned, so no
	* Lua 5.1 C call frame is suspended. Native pcall/require remain non-yieldable.
	*/
	bindAsync(name, callback) {
		const begin = (...args) => {
			let result;
			let failure;
			let rejected = false;
			return [Promise.resolve().then(() => callback(...args)).then((value) => {
				result = value;
			}, (error) => {
				rejected = true;
				failure = error;
			}), () => {
				if (rejected) throw failure instanceof Error ? failure : new Error(String(failure));
				return result;
			}];
		};
		const top = this.global.getTop();
		try {
			this.global.loadString(`
                local name, begin = ...
                _G[name] = function(...)
                    local request = begin(...)
                    coroutine.yield(request[0])
                    return request[1]()
                end
            `);
			this.global.pushValue(name);
			this.global.pushValue(begin);
			this.global.runSync(2);
		} finally {
			this.global.setTop(top);
		}
	}
	doFile(filename) {
		return this.callByteCode((thread) => thread.loadFile(filename));
	}
	doStringSync(script) {
		this.global.loadString(script);
		return this.global.runSync()[0];
	}
	doFileSync(filename) {
		this.global.loadFile(filename);
		return this.global.runSync()[0];
	}
	initTypeBindings() {
		JsType.create("js-function", (value) => typeof value === "function" && !value.toString().startsWith("class")).gc(this.funcManager.registerGcFunction(this.global)).push(({ thread, target }) => {
			const ref = thread.luaApi.ref(target);
			const luaPointer = thread.luaApi.lua_newuserdata(thread.address, 4);
			thread.luaApi.module.setValue(luaPointer, ref, "*");
			thread.luaApi.luaL_getmetatable(thread.address, "js-function");
			thread.luaApi.lua_setmetatable(thread.address, -2);
			thread.luaApi.lua_pushcclosure(thread.address, this.funcManager.registerFuncCallFunction(this.global), 1);
			const pointer = thread.luaApi.lua_topointer(thread.address, -1);
			this.funcManager.pointerRedirect.set(luaPointer, pointer);
			this.funcManager.addIndexRedirect(pointer, target);
			thread.luaApi.lua_createtable(thread.address, 0, 0);
			thread.luaApi.lua_pushcfunction(thread.address, this.funcManager.registerToStringFunction(this.global));
			thread.luaApi.lua_setfield(thread.address, -2, "__tostring");
			thread.luaApi.lua_pushcfunction(thread.address, this.funcManager.registerIndexFunction(this.global));
			thread.luaApi.lua_setfield(thread.address, -2, "__index");
			thread.luaApi.lua_pushcfunction(thread.address, this.funcManager.registerNewIndexFunction(this.global));
			thread.luaApi.lua_setfield(thread.address, -2, "__newindex");
			thread.luaApi.lua_setmetatable(thread.address, -2);
		}).bind(this.global);
		JsType.create("js-userdata", () => true).gc(this.funcManager.registerGcFunction(this.global)).call(this.funcManager.registerCallFunction(this.global)).index(this.funcManager.registerIndexFunction(this.global)).newindex(this.funcManager.registerNewIndexFunction(this.global)).tostring(this.funcManager.registerToStringFunction(this.global)).priority(-1).bind(this.global);
	}
	async callByteCode(loader) {
		const thread = this.global.newThread();
		const threadIndex = this.global.getTop();
		try {
			loader(thread);
			const result = await thread.run(0);
			if (result.length > 0) {
				this.luaApi.lua_xmove(thread.address, this.global.address, result.length);
				return this.global.getValue(this.global.getTop() - result.length + 1);
			}
			return;
		} finally {
			this.global.remove(threadIndex);
		}
	}
};
//#endregion
export { DictType, JsType, LUA_ENVIRONINDEX, LUA_GLOBALSINDEX, LUA_IDSIZE, LUA_MULTRET, LUA_REGISTRYINDEX, Lua, LuaApi, LuaEventCodes, LuaEventMasks, LuaGlobal, LuaLibraries, MultiReturn as LuaMultiReturn, LuaReturn, LuaTable, LuaThread, LuaTimeoutError, LuaType, PointerSize, mapTransform };
