import {
  Activity,
  ClipboardCheck,
  FileText,
  PackageCheck,
  QrCode,
  ShieldCheck,
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 bg-slate-950 text-white p-6 hidden md:block">
          <h1 className="text-2xl font-bold mb-8">SteriSphere</h1>

          <nav className="space-y-3 text-sm">
            <div className="bg-white/10 rounded-lg px-4 py-3">Dashboard</div>
            <div className="px-4 py-3 text-slate-300">Sterilization Cycles</div>
            <div className="px-4 py-3 text-slate-300">Instrument Packs</div>
            <div className="px-4 py-3 text-slate-300">Patient Traceability</div>
            <div className="px-4 py-3 text-slate-300">Reports</div>
            <div className="px-4 py-3 text-slate-300">Settings</div>
          </nav>
        </aside>

        <section className="flex-1 p-8">
          <header className="mb-8">
            <p className="text-sm text-slate-500">Dentaria Internal System</p>
            <h2 className="text-4xl font-bold mt-1">Sterilization Dashboard</h2>
            <p className="text-slate-600 mt-2">
              Digital traceability for sterilization cycles, instrument packs,
              and patient-linked compliance records.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <StatCard icon={<ClipboardCheck />} title="Cycles Today" value="0" />
            <StatCard icon={<PackageCheck />} title="Packs Created" value="0" />
            <StatCard icon={<ShieldCheck />} title="Failed Cycles" value="0" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ActionCard
              icon={<Activity />}
              title="Create Sterilization Cycle"
              description="Register a new autoclave cycle, operator, load details, and pass/fail status."
            />

            <ActionCard
              icon={<QrCode />}
              title="Generate QR Labels"
              description="Create unique QR codes for instrument pouches and cassette tracking."
            />

            <ActionCard
              icon={<PackageCheck />}
              title="Link Instruments to Patient"
              description="Scan a pouch QR code and connect it to a patient appointment."
            />

            <ActionCard
              icon={<FileText />}
              title="Export Audit Reports"
              description="Prepare clean compliance reports for internal review or inspection."
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200">
      <div className="text-blue-600 mb-4">{icon}</div>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 hover:shadow-md transition">
      <div className="text-blue-600 mb-4">{icon}</div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="text-slate-600 mt-2">{description}</p>
      <button className="mt-5 rounded-xl bg-slate-950 text-white px-4 py-2 text-sm">
        Open
      </button>
    </div>
  );
}