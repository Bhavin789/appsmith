import * as Y from "yjs";
import * as Sentry from "@sentry/react";
import { diff as deepDiff, applyChange, revertChange } from "deep-diff";

import { CanvasWidgetsReduxState } from "reducers/entityReducers/canvasWidgetsReducer";
import { processDiff, DSLDiff } from "./replayUtils";

const _DIFF_ = "diff";

export default class ReplayDSL {
  diffMap: any;
  undoManager: Y.UndoManager;
  dsl: CanvasWidgetsReduxState;
  logs: any[] = [];

  constructor(widgets: CanvasWidgetsReduxState) {
    const doc = new Y.Doc();
    this.diffMap = doc.get("map", Y.Map);
    this.dsl = widgets;
    this.diffMap.set(_DIFF_, []);
    this.undoManager = new Y.UndoManager(this.diffMap, { captureTimeout: 100 });
  }

  /**
   * checks if there is anything to replay or not based on differences between diffs
   *
   * @return boolean
   */
  shouldReplay() {
    const diffs = this.getDiffs();

    return diffs && diffs.length;
  }

  /**
   * get the diffs from yMap
   *
   * @returns
   */
  getDiffs() {
    return this.diffMap.get(_DIFF_);
  }

  /**
   * undo the last action. gets diff from yMap and apply that on currentDSL
   *
   * @returns
   */
  undo() {
    const diffs = this.getDiffs();

    if (this.shouldReplay()) {
      this.undoManager.undo();
      const replay = this.applyDiffs(diffs, true);
      this.logs.push({
        log: "replay redo",
        replay,
        diffs,
        dsl: this.dsl,
      });
      return {
        replayWidgetDSL: this.dsl,
        replay,
        logs: this.logs,
      };
    }

    return null;
  }

  /**
   * redo the last action. gets diff from yMap and apply that on currentDSL
   *
   * @returns
   */
  redo() {
    this.undoManager.redo();
    const diffs = this.getDiffs();

    if (this.shouldReplay()) {
      const replay = this.applyDiffs(diffs, false);
      this.logs.push({
        log: "replay redo",
        replay,
        diffs,
        dsl: this.dsl,
      });
      return {
        replayWidgetDSL: this.dsl,
        replay,
        logs: this.logs,
      };
    }
    return null;
  }

  /**
   * saves the changes (diff) in yMap
   * only if there is a deep diff
   *
   * @param widgets
   */
  update(widgets: CanvasWidgetsReduxState) {
    const startTime = performance.now();
    const diffs = deepDiff(this.dsl, widgets);
    if (diffs && diffs.length) {
      this.dsl = widgets;
      this.diffMap.set(_DIFF_, diffs);
    }
    const endTime = performance.now();
    this.logs.push({
      log: "replay updating",
      diffs,
      updateTime: `${endTime - startTime} ms`,
    });
  }

  clearLogs() {
    this.logs = [];
  }

  /**
   * apply the diff on the current dsl
   *
   * @param diffs
   * @param diffUpdate
   */
  applyDiffs(diffs: Array<DSLDiff>, isUndo: boolean) {
    const replay = {};

    for (const diff of diffs) {
      if (!Array.isArray(diff.path) || diff.path.length === 0) {
        continue;
      }
      const diffUpdate = isUndo ? revertChange : applyChange;
      try {
        processDiff(this.dsl, diff, replay, isUndo);
        diffUpdate(this.dsl, true, diff);
      } catch (e) {
        Sentry.captureException(e, {
          extra: {
            diff,
            updateLength: diffs.length,
          },
        });
      }
    }

    return replay;
  }
}
