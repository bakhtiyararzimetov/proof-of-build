import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import Landing from "./pages/Landing";
import Hackathons from "./pages/Hackathons";
import HackathonDetails from "./pages/HackathonDetails";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";

const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"));
const Admin = lazy(() => import("./pages/admin/Admin"));
const CreateHackathon = lazy(() => import("./pages/CreateHackathon"));
const Account = lazy(() => import("./pages/Account"));
const Verify = lazy(() => import("./pages/Verify"));

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="hackathons" element={<Hackathons />} />
          <Route path="hackathons/:id" element={<HackathonDetails />} />
          <Route path="hackathons/:id/admin" element={<Admin />} />
          <Route path="create" element={<CreateHackathon />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="account" element={<Account />} />
          <Route path="auth/callback" element={<AuthCallback />} />
          <Route path="verify" element={<Verify />} />
          <Route path="verify/:hash" element={<Verify />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
