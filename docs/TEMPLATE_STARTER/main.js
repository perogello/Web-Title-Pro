/*
  Optional template script.

  You only need this file if the title requires custom behavior.
  For a simple lower third, HTML + CSS is often enough.

  Web Title Pro checks window.WebTitleTemplate and calls these hooks:

  - mount(context)
    Runs once after the template has been loaded into the renderer.
    Use it for:
    - initial DOM queries
    - caching elements
    - starting observers

  - update(context)
    Runs after the app updates fields, timers, and editable styles.
    Use it for:
    - derived UI changes
    - text-based layout recalculation
    - state-dependent visual changes

  - show(context)
    Runs when the title is shown.
    Use it only if CSS classes are not enough for your intro.

  - hide(context)
    Runs when the title starts hiding.
    Use it for custom outro logic if needed.

  - unmount(context)
    Runs before the template is replaced by another template.
    Cleanup here:
    - intervals
    - event listeners
    - observers

  context contains:
  - context.stage
    The root renderer stage DOM element
  - context.snapshot
    Full renderer snapshot from the backend
  - context.output
    The active output object
  - context.program
    The active title/program state for that output
  - context.timers
    Current timer list
*/

window.WebTitleTemplate = {
  mount(context) {
    // Good place for one-time DOM queries.
    // Example:
    // this.root = context.stage.querySelector('.starter-title');
  },

  update(context) {
    // Called after fields, styles, and timers are already applied.
    // Example use case:
    // make the panel wider if the name line becomes very long.
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
