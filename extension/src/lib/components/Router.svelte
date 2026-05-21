<script module>
  import { type Component, createContext } from "svelte";

  // To add a new view to the router,
  // register it within the View type.
  type View =
    | "createAlert"
    | "editAlert"
    | "listAlerts"
    | "saveAlert"
    | "viewAlert";

  interface Router {
    view: View;
    props: any; // pass props to view components
    views: Partial<Record<View, Component>>; // set this up in App.svelte
    navigate(v: View, props?: any): void;
  }

  export const [getRouter, setRouter] = createContext<Router>();
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    currentView: View;
    onchange?: (view: View) => void;
    children: Snippet<[Router]>;
  }

  let { currentView, onchange, children }: Props = $props();

  const router: Router = {
    props: {},

    get view() {
      return currentView;
    },
    navigate(v: View, props?: any) {
      this.props = props;
      currentView = v;
      onchange?.(v);
    },

    views: {},
  };

  setRouter(router);
</script>

{@render children(router)}
