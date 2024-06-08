const sodium = require('sodium-native');

// Parse a minisign key represented as a base64 string.
// Throws exceptions on invalid keys.
function parseKey(key_str) {
  const key_info = Buffer.from(key_str, 'base64');

  const id = key_info.subarray(2, 10);
  const key = key_info.subarray(10);

  if (key.byteLength !== sodium.crypto_sign_PUBLICKEYBYTES) {
    throw new Error('invalid public key given');
  }

  return {
    id: id,
    key: key
  };
}

// Parse a buffer containing the contents of a minisign signature file.
// Throws exceptions on invalid signature files.
function parseSignature(sig_buf) {
  const untrusted_header = Buffer.from('untrusted comment: ');

  // Validate untrusted comment header, and skip
  if (!sig_buf.subarray(0, untrusted_header.byteLength).equals(untrusted_header)) {
    throw new Error('file format not recognised');
  }
  sig_buf = sig_buf.subarray(untrusted_header.byteLength);

  // Skip untrusted comment
  sig_buf = sig_buf.subarray(sig_buf.indexOf('\n') + 1);

  // Read and skip signature info
  const sig_info_end = sig_buf.indexOf('\n');
  const sig_info = Buffer.from(sig_buf.subarray(0, sig_info_end).toString(), 'base64');
  sig_buf = sig_buf.subarray(sig_info_end + 1);

  // Extract components of signature info
  const algorithm = sig_info.subarray(0, 2);
  const key_id = sig_info.subarray(2, 10);
  const signature = sig_info.subarray(10);

  // We don't look at the trusted comment or global signature, so we're done.

  return {
    algorithm: algorithm,
    key_id: key_id,
    signature: signature,
  };
}

// Given a parsed key, parsed signature file, and raw file content, verifies the
// signature. Does not throw. Returns 'true' if the signature is valid for this
// file, 'false' otherwise.
function verifySignature(pubkey, signature, file_content) {
  let signed_content;
  if (signature.algorithm.equals(Buffer.from('ED'))) {
    signed_content = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX);
    sodium.crypto_generichash(signed_content, file_content);
  } else {
    signed_content = file_content;
  }

  if (!signature.key_id.equals(pubkey.id)) {
    return false;
  }

  if (!sodium.crypto_sign_verify_detached(signature.signature, signed_content, pubkey.key)) {
    return false;
  }

  // Since we don't use the trusted comment, we don't bother verifying the global signature.
  // If we were to start using the trusted comment for any purpose, we must add this.

  return true;
}

module.exports = {
  parseKey,
  parseSignature,
  verifySignature,
};
