export const metadata = {
  title: "Setup Your Workspace — CCS HRMS",
  description: "Configure your organisation's work schedule, departments, and leave policy.",
};

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#060810", minHeight: "100vh" }}>
      {children}
    </div>
  );
}
