<script lang="ts">
  import { type Snippet } from "svelte";
  import { authState } from "../auth.svelte.ts";

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  const isLoggedIn = $derived(authState.status === "authenticated");
</script>

{#if isLoggedIn}
  <h3>Welcome back to Klaxon!</h3>
  {@render children()}
{:else}
  <h3>Welcome to Klaxon!</h3>
  <p>Klaxon monitors web pages for you and alerts you when they’ve changed.</p>
  <p>Your alerts will be saved to your MuckRock account.</p>
{/if}
