import ErpApp from './erp/ErpApp.jsx'
import CapturePage from './capture/CapturePage.jsx'

const routes = { '/erp': ErpApp, '/capture': CapturePage }

function Home() {
  return (
    <main className="home">
      <h1>AI Apprentice</h1>
      <ul>
        <li><a href="/erp" target="_blank">Mock ERP (expert)</a> · <a href="/capture">Capture</a></li>
        <li><a href="/map">Work Map</a></li>
        <li><a href="/erp?mode=teach" target="_blank">Mock ERP (new hire)</a> · <a href="/teach">Teach</a></li>
      </ul>
    </main>
  )
}

export default function App() {
  const Page = routes[window.location.pathname] || Home
  return <Page />
}
