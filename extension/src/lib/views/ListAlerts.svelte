<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";
  import { getRouter } from "../components/Router.svelte";
  import type { Event, Page, Run } from "../types";
  import RelativeTime from "../components/RelativeTime.svelte";

  interface Props {
    events: Page<Event>;
    runs: Page<Run>;
  }

  let { events, runs }: Props = $props();

  const router = getRouter();

  const isEmpty = $derived(events.results.length === 0);

  function getSiteLabel(run: Run): string {
    const event = run.event;
    if (event && typeof event === "object" && event.parameters?.site) {
      try {
        return new URL(event.parameters.site).hostname;
      } catch {
        return event.parameters.site;
      }
    }
    return "Unknown site";
  }

  const recentRuns = $derived(runs.results.slice(0, 6));
</script>

<div class="container list-alerts">
  <main class="section">
    {#if isEmpty}
      <div class="empty-state">
        <h3 class="welcome">Welcome to Klaxon</h3>
        <p class="empty-message">
          You don't have any alerts for this page.
        </p>
      </div>
    {:else}
      <div class="alerts-body">
        <p class="summary">
          You have <strong>{events.results.length} alert{events.results.length === 1 ? "" : "s"}</strong>
          for this page. Here are the most recent changes:
        </p>

        <div class="table">
          {#each recentRuns as run (run.uuid)}
            <div class="table-row">
              <p class="row-title">{getSiteLabel(run)}</p>
              <div class="row-meta">
                <span class="changed">Changed: <RelativeTime date={new Date(run.updated_at)} /></span>
                <button class="view-changes">View changes</button>
              </div>
            </div>
          {/each}
        </div>

        <button class="view-all">View all your alerts for this page &#187;</button>
      </div>
    {/if}
  </main>

  <footer class="button-row">
    <button class="btn-primary" onclick={() => router.navigate("createAlert")}>
      Create a new alert
      <ArrowRight />
    </button>
  </footer>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  main,
  footer {
    padding: 1em;
  }

  main {
    flex: 1 1 auto;
  }

  
  .section {
    display: flex;
    flex-direction: column;
    gap: 1em;
    padding: 1em;
    flex: 1 1 auto;
  }
  
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    gap: 4px;
  }
  
  .empty-message {
    margin: 0 0 1em;
    font-size: 16px;
    line-height: 1.3;
    color: #0c1e27;
  }
  
  .welcome {
    font-size: 2em;
  }

  .alerts-body {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .summary {
    margin: 0;
    font-size: 16px;
    line-height: 1.3;
    color: #0c1e27;
  }

  .summary strong {
    color: #c41a4d;
    text-decoration: underline;
  }

  .table {
    background: #fffefa;
    border: 1px solid #d8dee2;
    border-radius: 8px;
    overflow: hidden;
  }

  .table-row {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    padding: 1em;
  }

  .table-row + .table-row {
    border-top: 1px solid #d8dee2;
  }

  .row-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #c41a4d;
    text-decoration: underline;
    line-height: 1.3;
  }

  .row-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 12px;
  }

  .changed {
    color: #233944;
  }

  .view-changes {
    background: none;
    border: none;
    color: #c41a4d;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .view-all {
    background: none;
    border: none;
    color: #c41a4d;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }
</style>
