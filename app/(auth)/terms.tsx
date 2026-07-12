import { LegalDocument } from "../../components/LegalDocument";
import { TERMS_SECTIONS } from "../../lib/legalContent";

export default function AuthTermsScreen() {
  return <LegalDocument title="Terms of Service" sections={TERMS_SECTIONS} />;
}
