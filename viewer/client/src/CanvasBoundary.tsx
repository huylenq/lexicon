import { Component, type ReactNode } from "react";

/** A failed lazy bundle or editor must leave the reader and graph switch available. */
export default class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="empty" role="alert"><p>The canvas could not open. Saved project files are retained.</p>
      <button onClick={() => this.setState({ failed: false })}>Retry canvas</button><p>You can also switch to the graph from the header.</p></div> : this.props.children;
  }
}
