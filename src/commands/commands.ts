/**
 * Commands surface for the add-in. Currently the only ribbon control opens the task pane
 * directly via the ShowTaskpane action in manifest.xml, so no function command handlers
 * are wired up here. Office still requires the FunctionFile to load successfully.
 */

Office.onReady(() => {
  // No-op: present to satisfy Office.FunctionFile loading.
});
