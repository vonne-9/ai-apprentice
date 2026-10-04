import { createRoot } from 'react-dom/client'
import { ConversationProvider } from '@elevenlabs/react'
import App from './App.jsx'
import './app.css'

createRoot(document.getElementById('root')).render(<ConversationProvider><App /></ConversationProvider>)
