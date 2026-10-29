import { Component } from 'react'
import { useLocation } from 'react-router-dom'
class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <section className="page-shell" role="alert"><h1>This page could not load.</h1><p>Check your connection and reload the page. If you just submitted an order, check its status before placing another one.</p><button className="button button-dark" onClick={() => window.location.reload()}>Reload page</button></section>
    return this.props.children
  }
}
export default function RouteBoundary({ children }) {
  const location = useLocation()
  return <Boundary key={location.pathname}>{children}</Boundary>
}
