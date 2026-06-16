import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

import "vuetify/styles";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

import "@mdi/font/css/materialdesignicons.css";


const app = createApp(App)

// Load theme preference
const getDefaultTheme = () => {
  try {
    const saved = localStorage.getItem('daily_tracking_theme');
    return saved === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

app.use(createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: getDefaultTheme(),
    themes: {
      light: {
        colors: {
          primary: '#1976D2',
          secondary: '#424242',
          accent: '#82B1FF',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FB8C00',
        },
      },
      dark: {
        colors: {
          primary: '#2196F3',
          secondary: '#424242',
          accent: '#FF4081',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FB8C00',
        },
      },
    },
  },
}))

app.use(router)
app.mount('#app')