/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { Cell, Fun, Obj, Optional, Type } from '@ephox/katamari';
import Editor from './api/Editor';
import Formatter from './api/Formatter';
import Promise from './api/util/Promise';
import { Content, ContentFormat, GetContentArgs, SetContentArgs } from './content/ContentTypes';
import { getContentInternal } from './content/GetContentImpl';
import { insertHtmlAtCaret } from './content/InsertContentImpl';
import { setContentInternal } from './content/SetContentImpl';
import * as ApplyFormat from './fmt/ApplyFormat';
import { FormatChangeCallback, UnbindFormatChanged, RegisteredFormats, formatChangedInternal } from './fmt/FormatChanged';
import * as MatchFormat from './fmt/MatchFormat';
import * as RemoveFormat from './fmt/RemoveFormat';
import * as ToggleFormat from './fmt/ToggleFormat';
import { getSelectedContentInternal, GetSelectionContentArgs } from './selection/GetSelectionContentImpl';
import { RangeLikeObject } from './selection/RangeTypes';
import * as Operations from './undo/Operations';
import { Index, Locks, UndoBookmark, UndoLevel, UndoManager } from './undo/UndoManagerTypes';
import { addVisualInternal } from './view/VisualAidsImpl';

/** API implemented by the RTC plugin */
interface RtcRuntimeApi {
  undoManager: {
    beforeChange: () => void;
    add: () => UndoLevel;
    undo: () => UndoLevel;
    redo: () => UndoLevel;
    hasUndo: () => boolean;
    hasRedo: () => boolean;
    transact: (fn: () => void) => UndoLevel;
    reset: () => void;
    clear: () => void;
    ignore: (fn: () => void) => void;
    extra: (fn1: () => void, fn2: () => void) => void;
  };
  formatter: {
    canApply: (format: string) => boolean;
    match: (format: string, vars: Record<string, string>) => boolean;
    matchAll: () => string[];
    matchNode: () => boolean;
    closest: (formats: string) => string;
    apply: (format: string, vars: Record<string, string>) => void;
    remove: (format: string, vars: Record<string, string>) => void;
    toggle: (format: string, vars: Record<string, string>) => void;
    formatChanged: (formats: string, callback: FormatChangeCallback, similar: boolean) => UnbindFormatChanged;
  };
  editor: {
    getContent: (args: GetContentArgs) => Content;
    setContent: (content: Content, args: SetContentArgs) => Content;
    insertContent: (content: Content) => void;
    addVisual: () => void;
  };
  selection: {
    getContent: (args: GetSelectionContentArgs) => Content;
  };
  raw: {
    getRawModel: () => any;
  };
  rtc: {
    isRemote: boolean;
  };
}

/** A copy of the TinyMCE api definitions that the plugin overrides  */
interface RtcAdaptor {
  undoManager: {
    beforeChange: (locks: Locks, beforeBookmark: UndoBookmark) => void;
    add: (
      undoManager: UndoManager,
      index: Index,
      locks: Locks,
      beforeBookmark: UndoBookmark,
      level?: UndoLevel,
      event?: Event
    ) => UndoLevel;
    undo: (undoManager: UndoManager, locks: Locks, index: Index) => UndoLevel;
    redo: (index: Index, data: UndoLevel[]) => UndoLevel;
    clear: (undoManager: UndoManager, index: Index) => void;
    reset: (undoManager: UndoManager) => void;
    hasUndo: (undoManager: UndoManager, index: Index) => boolean;
    hasRedo: (undoManager: UndoManager, index: Index) => boolean;
    transact: (undoManager: UndoManager, locks: Locks, callback: () => void) => UndoLevel;
    ignore: (locks: Locks, callback: () => void) => void;
    extra: (undoManager: UndoManager, index: Index, callback1: () => void, callback2: () => void) => void;
  };
  formatter: {
    match: Formatter['match'];
    matchAll: Formatter['matchAll'];
    matchNode: Formatter['matchNode'];
    canApply: Formatter['canApply'];
    closest: Formatter['closest'];
    apply: Formatter['apply'];
    remove: Formatter['remove'];
    toggle: Formatter['toggle'];
    formatChanged: (registeredFormatListeners: Cell<RegisteredFormats>, formats: string, callback: FormatChangeCallback, similar?: boolean) => UnbindFormatChanged;
  };
  editor: {
    getContent: (args: GetContentArgs, format: ContentFormat) => Content;
    setContent: (content: Content, args: SetContentArgs) => Content;
    insertContent: (value: string, details) => void;
    addVisual: (elm?: HTMLElement) => void;
  };
  selection: {
    getContent: (format: ContentFormat, args: GetSelectionContentArgs) => Content;
  };
  raw: {
    getModel: () => Optional<any>;
  };
}

interface RtcPluginApi {
  setup?: () => Promise<RtcRuntimeApi>;
}

// TODO: Perhaps this should be a core API for overriding
interface RtcEditor extends Editor {
  rtcInstance: RtcAdaptor;
}

const makePlainAdaptor = (editor: Editor): RtcAdaptor => ({
  undoManager: {
    beforeChange: (locks, beforeBookmark) => Operations.beforeChange(editor, locks, beforeBookmark),
    add: (undoManager, index, locks, beforeBookmark, level, event) =>
      Operations.addUndoLevel(editor, undoManager, index, locks, beforeBookmark, level, event),
    undo: (undoManager, locks, index) => Operations.undo(editor, undoManager, locks, index),
    redo: (index, data) => Operations.redo(editor, index, data),
    clear: (undoManager, index) => Operations.clear(editor, undoManager, index),
    reset: (undoManager) => Operations.reset(undoManager),
    hasUndo: (undoManager, index) => Operations.hasUndo(editor, undoManager, index),
    hasRedo: (undoManager, index) => Operations.hasRedo(undoManager, index),
    transact: (undoManager, locks, callback) => Operations.transact(undoManager, locks, callback),
    ignore: (locks, callback) => Operations.ignore(locks, callback),
    extra: (undoManager, index, callback1, callback2) =>
      Operations.extra(editor, undoManager, index, callback1, callback2)
  },
  formatter: {
    match: (name, vars?, node?) => MatchFormat.match(editor, name, vars, node),
    matchAll: (names, vars) => MatchFormat.matchAll(editor, names, vars),
    matchNode: (node, name, vars, similar) => MatchFormat.matchNode(editor, node, name, vars, similar),
    canApply: (name) => MatchFormat.canApply(editor, name),
    closest: (names) => MatchFormat.closest(editor, names),
    apply: (name, vars?, node?) => ApplyFormat.applyFormat(editor, name, vars, node),
    remove: (name, vars, node, similar?) => RemoveFormat.remove(editor, name, vars, node, similar),
    toggle: (name, vars, node) => ToggleFormat.toggle(editor, name, vars, node),
    formatChanged: (registeredFormatListeners, formats, callback, similar) => formatChangedInternal(editor, registeredFormatListeners, formats, callback, similar)
  },
  editor: {
    getContent: (args, format) => getContentInternal(editor, args, format),
    setContent: (content, args) => setContentInternal(editor, content, args),
    insertContent: (value, details) => insertHtmlAtCaret(editor, value, details),
    addVisual: (elm) => addVisualInternal(editor, elm)
  },
  selection: {
    getContent: (format, args) => getSelectedContentInternal(editor, format, args)
  },
  raw: {
    getModel: () => Optional.none()
  }
});

const makeRtcAdaptor = (rtcEditor: RtcRuntimeApi): RtcAdaptor => {
  const defaultVars = (vars: Record<string, string>) => Type.isObject(vars) ? vars : {};
  const { undoManager, formatter, editor, selection, raw } = rtcEditor;

  return {
    undoManager: {
      beforeChange: undoManager.beforeChange,
      add: undoManager.add,
      undo: undoManager.undo,
      redo: undoManager.redo,
      clear: undoManager.clear,
      reset: undoManager.reset,
      hasUndo: undoManager.hasUndo,
      hasRedo: undoManager.hasRedo,
      transact: (_undoManager, _locks, fn) => undoManager.transact(fn),
      ignore: (_locks, callback) => undoManager.ignore(callback),
      extra: (_undoManager, _index, callback1, callback2) => undoManager.extra(callback1, callback2)
    },
    formatter: {
      match: (name, vars?, _node?) => formatter.match(name, defaultVars(vars)),
      matchAll: formatter.matchAll,
      matchNode: formatter.matchNode,
      canApply: (name) => formatter.canApply(name),
      closest: (names) => formatter.closest(names),
      apply: (name, vars, _node) => formatter.apply(name, defaultVars(vars)),
      remove: (name, vars, _node, _similar?) => formatter.remove(name, defaultVars(vars)),
      toggle: (name, vars, _node) => formatter.toggle(name, defaultVars(vars)),
      formatChanged: (_rfl, formats, callback, similar) => formatter.formatChanged(formats, callback, similar)
    },
    editor: {
      getContent: (args, _format) => editor.getContent(args),
      setContent: (content, args) => editor.setContent(content, args),
      insertContent: (content, _details) => editor.insertContent(content),
      addVisual: editor.addVisual
    },
    selection: {
      getContent: (_format, args) => selection.getContent(args)
    },
    raw: {
      getModel: () => Optional.some(raw.getRawModel())
    }
  };
};

const makeNoopAdaptor = (): RtcAdaptor => {
  const nul = Fun.constant(null);
  const empty = Fun.constant('');

  return {
    undoManager: {
      beforeChange: Fun.noop,
      add: nul,
      undo: nul,
      redo: nul,
      clear: Fun.noop,
      reset: Fun.noop,
      hasUndo: Fun.never,
      hasRedo: Fun.never,
      transact: nul,
      ignore: Fun.noop,
      extra: Fun.noop
    },
    formatter: {
      match: Fun.never,
      matchAll: Fun.constant([]),
      matchNode: Fun.never,
      canApply: Fun.never,
      closest: empty,
      apply: Fun.noop,
      remove: Fun.noop,
      toggle: Fun.noop,
      formatChanged: Fun.constant({ unbind: Fun.noop })
    },
    editor: {
      getContent: empty,
      setContent: empty,
      insertContent: Fun.noop,
      addVisual: Fun.noop
    },
    selection: {
      getContent: empty
    },
    raw: {
      getModel: Fun.constant(Optional.none())
    }
  };
};

export const isRtc = (editor: Editor) => Obj.has(editor.plugins, 'rtc');

const getRtcSetup = (editor: Editor): Optional<() => Promise<RtcRuntimeApi>> =>
  (Obj.get(editor.plugins, 'rtc') as Optional<RtcPluginApi>).bind((rtcPlugin) =>
    // This might not exist if the stub plugin is loaded on cloud
    Optional.from(rtcPlugin.setup)
  );

export const setup = (editor: Editor): Optional<Promise<boolean>> => {
  const editorCast = editor as RtcEditor;
  return getRtcSetup(editor).fold(
    () => {
      editorCast.rtcInstance = makePlainAdaptor(editor);
      return Optional.none();
    },
    (setup) => Optional.some(
      setup().then((rtcEditor) => {
        editorCast.rtcInstance = makeRtcAdaptor(rtcEditor);
        return rtcEditor.rtc.isRemote;
      }, (err) => {
        // We need to provide a noop adaptor on init failure since otherwise calls to hasUndo etc will continue to throw errors
        editorCast.rtcInstance = makeNoopAdaptor();
        return Promise.reject<boolean>(err);
      })
    )
  );
};

const getRtcInstanceWithFallback = (editor: Editor): RtcAdaptor =>
  // Calls to editor.getContent/editor.setContent should still work even if the rtcInstance is not yet available
  (editor as RtcEditor).rtcInstance ? (editor as RtcEditor).rtcInstance : makePlainAdaptor(editor);

const getRtcInstanceWithError = (editor: Editor): RtcAdaptor => {
  const rtcInstance = (editor as RtcEditor).rtcInstance;
  if (!rtcInstance) {
    throw new Error('Failed to get RTC instance not yet initialized.');
  } else {
    return rtcInstance;
  }
};

/** In theory these could all be inlined but having them here makes it clear what is overridden */
export const beforeChange = (editor: Editor, locks: Locks, beforeBookmark: UndoBookmark) => {
  getRtcInstanceWithError(editor).undoManager.beforeChange(locks, beforeBookmark);
};

export const addUndoLevel = (
  editor: Editor,
  undoManager: UndoManager,
  index: Index,
  locks: Locks,
  beforeBookmark: UndoBookmark,
  level?: UndoLevel,
  event?: Event
): UndoLevel =>
  getRtcInstanceWithError(editor).undoManager.add(undoManager, index, locks, beforeBookmark, level, event);

export const undo = (editor: Editor, undoManager: UndoManager, locks: Locks, index: Index): UndoLevel =>
  getRtcInstanceWithError(editor).undoManager.undo(undoManager, locks, index);

export const redo = (editor: Editor, index: Index, data: UndoLevel[]): UndoLevel =>
  getRtcInstanceWithError(editor).undoManager.redo(index, data);

export const clear = (editor: Editor, undoManager: UndoManager, index: Index): void => {
  getRtcInstanceWithError(editor).undoManager.clear(undoManager, index);
};

export const reset = (editor: Editor, undoManager: UndoManager): void => {
  getRtcInstanceWithError(editor).undoManager.reset(undoManager);
};

export const hasUndo = (editor: Editor, undoManager: UndoManager, index: Index): boolean =>
  getRtcInstanceWithError(editor).undoManager.hasUndo(undoManager, index);

export const hasRedo = (editor: Editor, undoManager: UndoManager, index: Index): boolean =>
  getRtcInstanceWithError(editor).undoManager.hasRedo(undoManager, index);

export const transact = (editor: Editor, undoManager: UndoManager, locks: Locks, callback: () => void): UndoLevel =>
  getRtcInstanceWithError(editor).undoManager.transact(undoManager, locks, callback);

export const ignore = (editor: Editor, locks: Locks, callback: () => void): void => {
  getRtcInstanceWithError(editor).undoManager.ignore(locks, callback);
};

export const extra = (
  editor: Editor,
  undoManager: UndoManager,
  index: Index,
  callback1: () => void,
  callback2: () => void
): void => {
  getRtcInstanceWithError(editor).undoManager.extra(undoManager, index, callback1, callback2);
};

export const matchFormat = (
  editor: Editor,
  name: string,
  vars?: Record<string, string>,
  node?: Node): boolean => getRtcInstanceWithError(editor).formatter.match(name, vars, node);

export const matchAllFormats = (
  editor: Editor,
  names: string[],
  vars?: Record<string, string>): string[] => getRtcInstanceWithError(editor).formatter.matchAll(names, vars);

export const matchNodeFormat = (
  editor: Editor,
  node: Node,
  name: string,
  vars?: Record<string, string>,
  similar?: boolean): boolean => getRtcInstanceWithError(editor).formatter.matchNode(node, name, vars, similar);

export const canApplyFormat = (
  editor: Editor,
  name: string): boolean => getRtcInstanceWithError(editor).formatter.canApply(name);

export const closestFormat = (
  editor: Editor,
  names: string): string => getRtcInstanceWithError(editor).formatter.closest(names);

export const applyFormat = (
  editor: Editor,
  name: string,
  vars?: Record<string, string>,
  node?: Node | RangeLikeObject
): void => {
  getRtcInstanceWithError(editor).formatter.apply(name, vars, node);
};

export const removeFormat = (editor: Editor, name: string, vars?: Record<string, string>, node?: Node | Range, similar?: boolean) => {
  getRtcInstanceWithError(editor).formatter.remove(name, vars, node, similar);
};

export const toggleFormat = (editor: Editor, name: string, vars: Record<string, string>, node: Node): void => {
  getRtcInstanceWithError(editor).formatter.toggle(name, vars, node);
};

export const formatChanged = (editor: Editor, registeredFormatListeners: Cell<RegisteredFormats>, formats: string, callback: FormatChangeCallback, similar: boolean = false): UnbindFormatChanged =>
  getRtcInstanceWithError(editor).formatter.formatChanged(registeredFormatListeners, formats, callback, similar);

export const getContent = (editor: Editor, args: GetContentArgs, format: ContentFormat): Content =>
  getRtcInstanceWithFallback(editor).editor.getContent(args, format);

export const setContent = (editor: Editor, content: Content, args: SetContentArgs): Content =>
  getRtcInstanceWithFallback(editor).editor.setContent(content, args);

export const insertContent = (editor: Editor, value: string, details): void =>
  getRtcInstanceWithFallback(editor).editor.insertContent(value, details);

export const getSelectedContent = (editor: Editor, format: ContentFormat, args: GetSelectionContentArgs): Content =>
  getRtcInstanceWithError(editor).selection.getContent(format, args);

export const addVisual = (editor: Editor, elm: HTMLElement): void =>
  getRtcInstanceWithError(editor).editor.addVisual(elm);
