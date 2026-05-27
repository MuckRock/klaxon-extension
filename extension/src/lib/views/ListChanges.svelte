<script lang="ts">
  import type { Event, Page, Run } from "../types";

  import { ArrowRight } from "@lucide/svelte";

  import RelativeTime from "../components/RelativeTime.svelte";
  import Welcome from "../components/Welcome.svelte";

  import { getRouter } from "../components/Router.svelte";

  import { isEvent, getSiteLabel } from "../utils";

  interface Props {
    events: Page<Event>;
    runs: Page<Run>;
  }

  let { events, runs }: Props = $props();

  const router = getRouter();

  let hasEvents = $derived(events.results.length > 0);
  let hasRuns = $derived(runs.results.length > 0);

  function getLabel(run: Run): string {
    const event = run.event;

    if (!isEvent(event)) {
      return "Unknown site";
    }

    return getSiteLabel(event);
  }

  const recentRuns = $derived(runs.results.slice(0, 6));
</script>

<div class="container list-changes">
  <main class="section">
    <Welcome>
      {#if !hasEvents}
        <div class="empty-state">
          <p class="empty-message">You don't have any alerts for this page.</p>
        </div>
      {:else}
        <div class="alerts-body">
          <p class="summary">
            You have <button
              class="link"
              onclick={() => router.navigate("listAlerts")}
            >
              {events.results.length} alert{events.results.length === 1
                ? ""
                : "s"}
            </button>
            for this page.
          </p>
          {#if hasRuns}
            <p>Here are the most recent changes:</p>
          {:else}
            <p>No changes have been recorded yet. Check back later.</p>
          {/if}

          <div class="table">
            {#each recentRuns as run (run.uuid)}
              <div class="table-row">
                <p class="row-title">
                  {#if run.data.snapshot}
                    <a
                      href={run.data.snapshot}
                      class="link"
                      target="_blank"
                      rel="nooopener noreferer"
                    >
                      {getLabel(run)}
                    </a>
                  {:else}
                    <strong>{getLabel(run)}</strong>
                  {/if}
                </p>
                <div class="row-meta">
                  <span class="changed">
                    Changed: <RelativeTime date={new Date(run.created_at)} />
                  </span>
                  {#if run.data.compare}
                    <a
                      class="view-changes"
                      href={run.data.compare}
                      target="_blank"
                      rel="noopener noreferer"
                    >
                      View changes
                    </a>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <button
            class="view-all"
            onclick={() => router.navigate("listAlerts")}
          >
            View all your alerts for this page &#187;
          </button>
        </div>
      {/if}
    </Welcome>
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
    font-size: var(--font-md, 16px);
    line-height: 1.3;
    color: #0c1e27;
  }

  .alerts-body {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .summary {
    margin: 0;
    font-size: var(--font-md, 16px);
    line-height: 1.3;
    color: #0c1e27;
  }

  .row-title a,
  .row-title strong {
    color: var(--klaxon-color-link, #c41a4d);
  }

  button.link {
    border: none;
    padding: 0;
    background: none;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    cursor: pointer;
    color: var(--klaxon-color-link, #c41a4d);
    text-decoration: underline;
    font-weight: bold;
  }

  .table {
    background: #fffefa;
    border: 1px solid var(--gray-2, #d8dee2);
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
    border-top: 1px solid var(--gray-2, #d8dee2);
  }

  .row-title {
    margin: 0;
    font-size: var(--font-sm, 14px);
    font-weight: 600;
    color: var(--klaxon-color-link, #c41a4d);
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
    color: var(--klaxon-color-link, #c41a4d);
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .view-all {
    background: none;
    border: none;
    color: var(--klaxon-color-link, #c41a4d);
    font-size: var(--font-sm, 14px);
    font-weight: 700;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }
</style>
