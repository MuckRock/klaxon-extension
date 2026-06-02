<script lang="ts">
  import { authState, login, logout } from "../auth.svelte.ts";
  import { X } from "@lucide/svelte";

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();
</script>

<div class="container">
  <div class="header">
    <h2>Klaxon</h2>
    <button onclick={onclose} aria-label="Close">
      <X />
    </button>
  </div>
  <div class="auth">
    {#if authState.status === "authenticated"}
      <div class="user">
        <strong>
          {authState.user?.preferred_username ??
            authState.user?.name ??
            authState.user?.email ??
            "Squarelet user"}
        </strong>
      </div>
      <button class="link" onclick={() => logout()}>Sign out</button>
    {:else}
      <button
        class="primary"
        disabled={authState.status === "authenticating"}
        onclick={() => login()}
      >
        {authState.status === "authenticating"
          ? "Signing in…"
          : "Sign in with MuckRock"}
      </button>
      {#if authState.error}
        <p class="error">{authState.error}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    padding: 0.75em 1em;
    border-bottom: 1px solid #eee;
    background: #f8f8f8;
  }
  .header,
  .auth {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: var(--font-md, 16px);
    font-weight: 600;
  }

  .header button {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0 4px;
    line-height: 1;
  }

  .header button:hover {
    color: #000;
  }

  .auth .user {
    font-size: 13px;
    color: #333;
    margin-bottom: 0;
  }

  .auth button.primary {
    width: 100%;
    padding: 8px 12px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .auth button.primary:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .auth button.link {
    background: none;
    border: none;
    color: #2563eb;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
  }

  .auth .error {
    color: #b91c1c;
    font-size: 12px;
    margin: 6px 0 0;
  }
</style>
