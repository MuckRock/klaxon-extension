<script lang="ts">
  import { getContext } from "svelte";

  interface Props {
    locked: boolean;
    selector: string;
    matchText: string;
  }

  let { locked, selector, matchText }: Props = $props();

  const nav = getContext<{
    navigate: (v: string, opts?: { watchMode?: string }) => void;
  }>("navigation");

  function handleAlertEntirePage() {
    nav.navigate("saveAlert", { watchMode: "page" });
  }

  function handleAlertSelection() {
    nav.navigate("saveAlert", { watchMode: "selection" });
  }

  function handleBack() {
    console.log("TODO: navigate back");
  }
</script>

<div class="create-alert">
  <button class="back-link" onclick={handleBack}>
    &#8249; <span>Back</span>
  </button>

  <section class="section">
    <h3>Create an alert for the entire page</h3>
    <p class="description">
      By default, Klaxon watches the entire page for changes. If that sounds
      good, you can proceed to the next step.
    </p>
    <div class="button-row">
      <button class="btn-primary" onclick={handleAlertEntirePage}>
        Add alert details
      </button>
    </div>
  </section>

  <hr />

  <section class="section">
    <h3>Create an alert for part of the page</h3>
    <p class="description">
      Optionally, Klaxon can watch <strong>part of the page</strong> for changes.
    </p>

    {#if locked}
      <div class="message-card green">
        <div class="message-content">
          <strong>Want to tweak your selection?</strong>
          <span>Use the slider in the canvas to make adjustments.</span>
        </div>
      </div>
    {:else}
      <div class="message-card orange">
        <div class="message-content">
          <strong>Click or tap</strong>
          <span>on the part of the page you'd like to monitor.</span>
        </div>
      </div>
    {/if}

    <div class="selector-panel">
      <div class="selector-panel-text">
        <span>Feeling hack-y?</span>
        <strong>You can write your own CSS.</strong>
      </div>
      {#if locked}
        <div class="selector-value">
          <code>{selector}</code>
        </div>
      {/if}
    </div>

    <p class="description">
      Once the selection looks right, you can proceed to the next step.
    </p>
    <div class="button-row">
      <button
        class="btn-primary"
        disabled={!locked}
        onclick={handleAlertSelection}
      >
        Add alert details
      </button>
    </div>
  </section>
</div>

<style>
  .create-alert {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .back-link {
    background: none;
    border: none;
    color: #c41a4d;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }

  .back-link span {
    text-decoration: underline;
  }

  .back-link:hover {
    opacity: 0.8;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #000;
    line-height: 1.2;
  }

  .description {
    margin: 0;
    font-size: 14px;
    line-height: 1.4;
    color: #000;
  }

  hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 0;
  }

  .button-row {
    display: flex;
    justify-content: flex-end;
  }

  .btn-primary {
    background: #ec7b6b;
    color: #f5f6f7;
    border: 1px solid #69515c;
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    line-height: 1.4;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .message-card {
    display: flex;
    align-items: center;
    min-height: 100px;
    padding: 16px;
    border-radius: 8px;
    border-width: 2px;
    border-style: solid;
  }

  .message-card.orange {
    background: #fff0ee;
    border-color: #ec7b6b;
  }

  .message-card.green {
    background: #ebf9f6;
    border-color: #27c6a2;
  }

  .message-content {
    font-size: 16px;
    line-height: 1.3;
    color: #000;
  }

  .message-content strong {
    display: block;
    margin-bottom: 2px;
  }

  .selector-panel {
    background: #eef3f9;
    border: 2px solid #b5ceed;
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .selector-panel-text {
    font-size: 16px;
    line-height: 1.3;
    color: #233944;
  }

  .selector-panel-text strong {
    display: block;
  }

  .selector-value {
    background: #fff;
    border: 1px solid #b5ceed;
    border-radius: 4px;
    padding: 6px 8px;
    overflow-x: auto;
  }

  .selector-value code {
    font-size: 13px;
    font-family: monospace;
    color: #233944;
    word-break: break-all;
  }
</style>
