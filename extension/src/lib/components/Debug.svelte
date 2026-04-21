<script lang="ts">
  interface Props {
    selector: string;
    matchText: string;
    url: string;
  }

  let { selector, matchText, url }: Props = $props();
</script>

<label>
  Page URL
  <input type="text" readonly value={url} />
</label>

<label>
  CSS Selector
  <input type="text" readonly value={selector} />
</label>

{#if matchText}
  <div class="match-text">
    <strong>Matched text:</strong>
    <p>{matchText}</p>
  </div>
{/if}

<p class="hint">Click an element or drag to select a region.</p>

<style>
  label {
    display: block;
    margin-bottom: 12px;
    font-weight: 500;
    font-size: 12px;
    color: #666;
  }

  input {
    display: block;
    width: 100%;
    margin-top: 4px;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    font-family: monospace;
    background: #f9f9f9;
    box-sizing: border-box;
  }

  .match-text {
    margin-bottom: 12px;
  }

  .match-text strong {
    font-size: 12px;
    color: #666;
  }

  .match-text p {
    margin: 4px 0 0;
    padding: 8px;
    background: #f0f7ff;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1.4;
    max-height: 200px;
    overflow-y: auto;
  }

  .hint {
    color: #999;
    font-size: 12px;
    font-style: italic;
  }
</style>
