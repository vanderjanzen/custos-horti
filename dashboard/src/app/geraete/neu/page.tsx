import { IconUsb } from "@/components/Icons";

export const metadata = { title: "Gerät hinzufügen · Custos Horti" };

const steps = [
  {
    title: "Per USB verbinden",
    text: "Steck den ESP32 mit einem Datenkabel an diesen Computer. Funktioniert in Chrome und Edge.",
  },
  {
    title: "Firmware flashen",
    text: "Die aktuelle Custos-Firmware wird direkt aus dem Browser auf den ESP geschrieben.",
  },
  {
    title: "WLAN & Server",
    text: "WLAN-Daten eingeben – der Sensor meldet sich danach automatisch hier im Dashboard.",
  },
];

export default function Page() {
  return (
    <>
      <div className="page-head reveal">
        <div>
          <div className="eyebrow">Hardware</div>
          <h1 className="page-title">Gerät hinzufügen</h1>
          <p className="page-sub">Neuen Sensor in drei Schritten einrichten</p>
        </div>
      </div>

      <div className="steps">
        {steps.map((s, i) => (
          <div className="step glass float reveal" key={s.title}>
            <span className="step-num">0{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </div>

      <div className="notice glass reveal">
        <IconUsb />
        <span style={{ flex: 1 }}>Das Flashen aus dem Browser (ESP Web Tools + Improv) folgt im nächsten Schritt.</span>
        <button className="btn btn-primary" disabled>
          Verbinden
        </button>
      </div>
    </>
  );
}
