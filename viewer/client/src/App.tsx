import { Link, Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import DesktopUpdate from "./DesktopUpdate";
import Library from "./Library";
import Reader from "./Reader";
function LayersRedirect() {
  const { projectId = "shop" } = useParams();
  const [params] = useSearchParams();
  const next = new URLSearchParams(params); next.set("presentation", "layers");
  return <Navigate replace to={`/p/${projectId}?${next}`} />;
}
export default function App() {
  return (
    <>
      <DesktopUpdate />
      <Routes>
        <Route path="/layers/:projectId?" element={<LayersRedirect />} />
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
