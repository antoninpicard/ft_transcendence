import { createApp } from "vue";
import App from "./App.vue";
import router from "./router.js";
import i18n from "./i18n.js";
import "./style.css";

createApp(App).use(router).use(i18n).mount("#app");
