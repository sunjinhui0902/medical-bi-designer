param(
  [Parameter(Mandatory = $true)]
  [string]$Target
)

$typeDefinition = @'
using System;
using System.Runtime.InteropServices;

public static class MedicalBiCredentialReader
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct Credential
    {
        public UInt32 Flags;
        public UInt32 Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, uint type, int reserved, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr buffer);
}
'@

Add-Type -TypeDefinition $typeDefinition
$credentialPointer = [IntPtr]::Zero

if (-not [MedicalBiCredentialReader]::CredRead($Target, 1, 0, [ref]$credentialPointer)) {
  throw "Windows credential target was not found."
}

try {
  $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
    $credentialPointer,
    [type][MedicalBiCredentialReader+Credential]
  )
  $secretBytes = New-Object byte[] $credential.CredentialBlobSize
  [Runtime.InteropServices.Marshal]::Copy(
    $credential.CredentialBlob,
    $secretBytes,
    0,
    $credential.CredentialBlobSize
  )
  [Console]::Out.Write([Text.Encoding]::Unicode.GetString($secretBytes))
}
finally {
  if ($credentialPointer -ne [IntPtr]::Zero) {
    [MedicalBiCredentialReader]::CredFree($credentialPointer)
  }
}
