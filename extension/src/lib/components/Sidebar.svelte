<script lang="ts">
  import ListAlerts from "../views/ListAlerts.svelte";
  import CreateAlert from "../views/CreateAlert.svelte";
  import SaveAlert from "../views/SaveAlert.svelte";
  // Mocking data until we have working loading functions
  import { eventsList, emptyEventsList } from "../../test/fixtures/events";
  import { runs, emptyRuns } from "../../test/fixtures/runs";
  import Router from "./Router.svelte";
  import Toaster from "./Toaster.svelte";
  import ToastList from "./ToastList.svelte";
  import Header from "./Header.svelte";

  interface Props {
    selector: string;
    matchText: string;
    url: string;
    locked: boolean;
    onclearselection: () => void;
    onselectorchange: (css: string) => Element | null;
    onroutechange: (view: string) => void;
    onclose: () => void;
  }

  let {
    selector,
    matchText,
    url,
    locked,
    onclearselection,
    onselectorchange,
    onroutechange,
    onclose,
  }: Props = $props();
</script>

<Toaster>
  <Router initialView="listAlerts" onchange={onroutechange}>
    {#snippet children(router)}
      <div class="sidebar">
        <Header {onclose} />

        <div class="body">
          <ToastList />
          {#if router.view === "listAlerts"}
            <ListAlerts events={eventsList} runs={runs} />
          {:else if router.view === "createAlert"}
            <CreateAlert
              {locked}
              {selector}
              {matchText}
              {onselectorchange}
              {onclearselection}
            />
          {:else if router.view === "saveAlert"}
            <SaveAlert {selector} {matchText} {url} onsave={onclearselection} />
          {/if}
        </div>
      </div>
    {/snippet}
  </Router>
</Toaster>

<style>
  .sidebar {
    position: fixed;
    top: 0;
    right: 0;
    width: 300px;
    height: 100vh;
    background: #fff;
    border-left: 2px solid #ccc;
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    color: #333;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  }

  .body {
    overflow-y: auto;
    flex: 1;
  }
</style>
