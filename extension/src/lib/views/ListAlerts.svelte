<script lang="ts">
  import type { Event, Page } from "../types";

  import { ArrowRight } from "@lucide/svelte";

  import BackLink from "../components/BackLink.svelte";
  import RelativeTime from "../components/RelativeTime.svelte";
  import { getRouter } from "../components/Router.svelte";
  import { schedules } from "../api";
  import { getSiteLabel } from "../utils";

  interface Props {
    events: Page<Event>;
  }

  let { events }: Props = $props();

  const router = getRouter();
</script>

<div class="container list-alerts">
  <BackLink view="listChanges" />

  <main class="section">
    <h3>Your alerts</h3>

    <div class="alerts">
      {#each events.results as event (event.id)}
        <div class="event">
          <div class="header">
            <input type="checkbox" />
            <h4>{getSiteLabel(event)}</h4>
          </div>
          <div class="body">
            <dl>
              <dt>Created:</dt>
              <dd>
                <RelativeTime date={new Date(event.created_at)} />
              </dd>
              <dt>Alert status</dt>
              <dd>{schedules[event.event]}</dd>
            </dl>
          </div>
        </div>
      {/each}
    </div>
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
    padding: var(--font-md, 16px) 0.75rem;
    flex-direction: column;
    gap: var(--font-lg, 20px);
    border-bottom: 1px solid var(--orange-2, #ffc2ba);
    background: #fffdf3;
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

  .event {
    display: flex;
    padding: 0.75rem;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
    align-self: stretch;

    border-bottom: 1px solid var(--gray-2, #d8dee2);

    .header {
      display: flex;
      align-items: flex-start;
      gap: 0.875rem;
      align-self: stretch;

      input[type="checkbox"] {
        display: flex;
        padding-top: 0.25rem;
        align-items: flex-start;
        gap: 0.625rem;
        align-self: stretch;
      }

      h4 {
        flex: 1 0 0;

        color: var(--klaxon-color-link, #c41a4d);
        font-size: var(--font-md, 16px);
        font-style: normal;
        font-weight: 700;
        line-height: 130%; /* 1.3rem */
      }
    }

    .body {
      display: flex;
      padding-left: 2.125rem;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.375rem;
      align-self: stretch;

      dl {
      }

      dd {
      }

      dt {
        font-weight: bold;
      }
    }
  }
</style>
