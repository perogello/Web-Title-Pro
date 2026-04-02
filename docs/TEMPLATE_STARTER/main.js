/*
  Optional template script.

  If your title only needs HTML + CSS, this file can stay empty.
  But if you need custom logic, Web Title Pro renderer looks for
  window.WebTitleTemplate and can call:

  - mount(context)   -> once after template load
  - update(context)  -> after every state update
  - show(context)    -> when SHOW happens
  - hide(context)    -> when HIDE happens
  - unmount(context) -> before template is replaced

  context contains:
  - context.stage    -> root render stage DOM node
  - context.snapshot -> full renderer snapshot
  - context.output   -> current output
  - context.program  -> current title state for that output
  - context.timers   -> timers array
*/

window.WebTitleTemplate = {
  mount(context) {
    // Good place for one-time DOM queries or startup logic.
    // Example:
    // const title = context.stage.querySelector('.starter-title');
  },

  update(context) {
    // Called after fields / styles / timers are applied.
    // Use this if the template needs extra derived UI behavior.
  },

  show(context) {
    // Optional hook when the title goes on air.
  },

  hide(context) {
    // Optional hook when the title starts hiding.
  },

  unmount(context) {
    // Cleanup timers, listeners, observers, etc.
  },
};
