import { Link, Route, Routes } from "react-router-dom";
import DesktopUpdate from "./DesktopUpdate";
import Library from "./Library";
import Reader from "./Reader";
export default function App() {
  return (
    <>
      <DesktopUpdate />
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/p/:projectId" element={<Reader />} />
        <Route
          path="*"
          element={
            <div className="empty">
              <h1>Page unavailable</h1>
              <Link to="/">Open the library</Link>
            </div>
          }
        />
      </Routes>
    </>
  );
}
