// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState } from "react";
import { createUnlockedPdfFile, getPdfAccessMode, inspectPdfAccess, isPdfFile } from "./lib/pdf-passwords.js";

const NEEDS_ATTENTION = new Set(["checking", "password-required", "wrong-password", "owner-required", "unsupported"]);

export function useProtectedPdfGate(tool, files, setFiles) {
  const mode = useMemo(() => getPdfAccessMode(tool), [tool]);
  const credentialsRef = useRef(new WeakMap());
  const outputPasswordRef = useRef(null);
  const [checks, setChecks] = useState(new Map());
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [protectedInputSeen, setProtectedInputSeen] = useState(false);
  const [outputPasswordAvailable, setOutputPasswordAvailable] = useState(false);
  const [keepOutputProtected, setKeepOutputProtected] = useState(false);
  const producesPdf = Boolean(tool?.output?.some((format) => String(format).toLowerCase() === ".pdf"));
  const outputProtectionEligible = Boolean(mode && !["unlock-pdf", "protect-pdf"].includes(tool?.slug));

  useEffect(() => {
    let cancelled = false;
    credentialsRef.current = new WeakMap();
    setPassword("");

    const pdfFiles = mode ? files.filter(isPdfFile) : [];
    if (!pdfFiles.length) {
      setChecks(new Map());
      return () => { cancelled = true; };
    }

    setChecks(new Map(pdfFiles.map((file) => [file, {
      file,
      status: "checking",
      protected: false,
      message: `Checking ${file.name} locally…`,
    }])));

    (async () => {
      const inspected = await Promise.all(pdfFiles.map(async (file) => ({ file, result: await inspectPdfAccess(file, mode) })));
      if (cancelled) return;
      if (inspected.some(({ result }) => result.protected)) setProtectedInputSeen(true);

      const replacements = new Map();
      const nextChecks = new Map();
      for (const { file, result } of inspected) {
        if (result.status === "verified" && mode === "modify") {
          try {
            const unlocked = await createUnlockedPdfFile(file, "");
            replacements.set(file, unlocked);
          } catch (error) {
            nextChecks.set(file, {
              file,
              status: "owner-required",
              protected: true,
              message: `${file.name} opens without a password, but its owner restrictions prevent this change. Enter the owner password to continue.`,
              cause: error,
            });
          }
        } else {
          if (result.status === "verified") credentialsRef.current.set(file, "");
          nextChecks.set(file, { file, ...result });
        }
      }
      if (cancelled) return;
      if (replacements.size) {
        setFiles((current) => current.map((file) => replacements.get(file) || file));
      } else {
        setChecks(nextChecks);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [files, mode, setFiles]);

  useEffect(() => () => {
    credentialsRef.current = new WeakMap();
    outputPasswordRef.current = null;
  }, []);

  const pdfFiles = mode ? files.filter(isPdfFile) : [];
  const active = pdfFiles.map((file) => checks.get(file)).find((entry) => entry && NEEDS_ATTENTION.has(entry.status)) || null;
  const ready = !mode || pdfFiles.every((file) => {
    const status = checks.get(file)?.status;
    return status === "ready" || status === "verified";
  });

  const verify = async () => {
    if (!active || active.status === "checking" || active.status === "unsupported" || !password) return;
    const candidate = password;
    setVerifying(true);
    setChecks((current) => new Map(current).set(active.file, { ...active, status: "checking", message: `Checking ${active.file.name} locally…` }));
    try {
      const result = await inspectPdfAccess(active.file, mode, candidate);
      setPassword("");
      if (result.status === "verified" && candidate && outputPasswordRef.current === null) {
        outputPasswordRef.current = candidate;
        setOutputPasswordAvailable(true);
      }
      if (result.status === "verified" && mode === "modify") {
        try {
          const unlocked = await createUnlockedPdfFile(active.file, candidate);
          credentialsRef.current.delete(active.file);
          setFiles((current) => current.map((file) => file === active.file ? unlocked : file));
          return;
        } catch (error) {
          setChecks((current) => new Map(current).set(active.file, {
            file: active.file,
            status: "owner-required",
            protected: true,
            message: `${active.file.name} opened, but this password cannot remove the restrictions needed for this tool. Enter the owner password instead.`,
            cause: error,
          }));
          return;
        }
      }
      if (result.status === "verified") credentialsRef.current.set(active.file, candidate);
      setChecks((current) => new Map(current).set(active.file, { file: active.file, ...result }));
    } finally {
      setVerifying(false);
    }
  };

  const clearCredentials = ({ resetPreference = true } = {}) => {
    credentialsRef.current = new WeakMap();
    outputPasswordRef.current = null;
    setOutputPasswordAvailable(false);
    setPassword("");
    if (resetPreference) setKeepOutputProtected(false);
    setChecks((current) => {
      const next = new Map(current);
      for (const [file, entry] of next) {
        if (entry.status === "verified" && entry.protected) {
          next.set(file, {
            file,
            status: "password-required",
            protected: true,
            message: `${file.name} is password protected. Enter its password to continue here.`,
          });
        }
      }
      return next;
    });
  };

  const resetForFileChange = () => {
    clearCredentials({ resetPreference: true });
    setProtectedInputSeen(false);
  };

  const inputPasswords = mode
    ? files.map((file) => credentialsRef.current.has(file) ? credentialsRef.current.get(file) : undefined)
    : undefined;
  const activeCanProvidePassword = Boolean(active
    && !["checking", "unsupported"].includes(active.status));
  const outputProtectionVisible = outputProtectionEligible
    && (protectedInputSeen || Boolean(active?.protected));
  const outputProtectionDisabled = !producesPdf
    || (!outputPasswordAvailable && !activeCanProvidePassword);
  const outputProtectionMessage = !producesPdf
    ? `${tool.name} creates ${tool.output.join(" / ").toUpperCase()} output, not PDF files, so output password protection is unavailable.`
    : outputPasswordAvailable
      ? `${keepOutputProtected ? "Generated PDFs will use" : "You can reuse"} the first non-empty password verified for this job. Protection is newly applied and may not preserve every original permission or security detail.`
      : activeCanProvidePassword
        ? "After this password is verified, it can be reused to protect every generated PDF. The default output remains unlocked."
        : "No reusable non-empty password is available. Reselect the protected input to verify one; output remains unlocked.";
  const outputProtection = {
    visible: outputProtectionVisible,
    supported: producesPdf,
    checked: keepOutputProtected,
    disabled: outputProtectionDisabled,
    onChange: setKeepOutputProtected,
    message: outputProtectionMessage,
    multiple: files.length > 1,
  };
  const outputPassword = keepOutputProtected && outputPasswordAvailable
    ? outputPasswordRef.current
    : undefined;

  return {
    active,
    ready,
    password,
    setPassword,
    verifying,
    verify,
    inputPasswords,
    outputPassword,
    outputProtection,
    clearCredentials,
    resetForFileChange,
  };
}
