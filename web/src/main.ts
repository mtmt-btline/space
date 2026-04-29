import './style.css'
import init, { greet } from '../pkg/engine.js'

await init()

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('missing #app')
}

app.textContent = greet()
