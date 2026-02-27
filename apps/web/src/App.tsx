import { BrowserRouter as Router } from 'react-router-dom'
import { AppRoutes } from './app/routes'
import { AppNav } from '@components/AppNav'
import './App.css'

function App() {
  return (
    <Router>
      <div className="app">
        <AppNav />
        <main className="app-main">
          <AppRoutes />
        </main>
      </div>
    </Router>
  )
}

export default App
