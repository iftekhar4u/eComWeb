import { Link } from 'react-router-dom'
export function NotFound() { return <main className="page-shell empty-state"><p className="eyebrow">404</p><h1>That page wandered off.</h1><p>Let's get you back to your ritual.</p><Link className="button button-dark" to="/">Return home</Link></main> }
