import "./styles.css";

import { mount } from "svelte";

import { appRoot } from "./app/runtime";
import App from "./ui/App.svelte";

// The root Svelte component owns bootstrap and every Console surface; each
// panel reacts to the runes-backed shell store, so no render step exists.
mount(App, { target: appRoot });
