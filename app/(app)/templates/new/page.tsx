"use client";

import { useRouter } from "next/navigation";
import FormWizard from "@/components/form-wizard/FormWizard";
import { saveWizardTemplate } from "@/lib/form-wizard/saveTemplate";

export default function NewTemplatePage() {
  const router = useRouter();

  return (
    <div className="h-full min-h-0">
      <FormWizard
        onSave={async (payload) => {
          await saveWizardTemplate(payload);
          router.push("/scan");
        }}
      />
    </div>
  );
}
