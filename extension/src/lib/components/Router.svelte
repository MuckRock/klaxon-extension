<script module>
  import { createContext } from "svelte";

  // To add a new view to the router,
  // register it within the View type.
  type View = "listAlerts" | "createAlert" | "saveAlert";

  interface Router {
    view: View;
    props: any; // pass props to view components
    navigate(v: View, props?: any): void;
  }

  export const [getRouter, setRouter] = createContext<Router>();
</script>

<script lang="ts">
  import { type Snippet, untrack } from "svelte";

  interface Props {
    initialView: View;
    onchange?: (view: View) => void;
    children: Snippet<[Router]>;
  }

  let { initialView, onchange, children }: Props = $props();

  let currentView = $state<View>(untrack(() => initialView));

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
  };

  setRouter(router);
</script>

{@render children(router)}
