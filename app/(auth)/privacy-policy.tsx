import { LegalDocument } from "../../components/LegalDocument";
import { PRIVACY_POLICY_SECTIONS } from "../../lib/legalContent";

export default function AuthPrivacyPolicyScreen() {
  return <LegalDocument title="Privacy Policy" sections={PRIVACY_POLICY_SECTIONS} />;
}
