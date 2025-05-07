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
  const trusted_header = Buffer.from('trusted comment: ');

  // Validate untrusted comment header, and skip
  if (!sig_buf.subarray(0, untrusted_header.byteLength).equals(untrusted_header)) {
    throw new Error('invalid minisign signature: bad untrusted comment header');
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

  // Validate trusted comment header, and skip
  if (!sig_buf.subarray(0, trusted_header.byteLength).equals(trusted_header)) {
    throw new Error('invalid minisign signature: bad trusted comment header');
  }
  sig_buf = sig_buf.subarray(trusted_header.byteLength);

  // Read and skip trusted comment
  const trusted_comment_end = sig_buf.indexOf('\n');
  const trusted_comment = sig_buf.subarray(0, trusted_comment_end);
  sig_buf = sig_buf.subarray(trusted_comment_end + 1);

  // Read and skip global signature; handle missing trailing newline, just in case
  let global_sig_end = sig_buf.indexOf('\n');
  if (global_sig_end == -1) global_sig_end = sig_buf.length;
  const global_sig = Buffer.from(sig_buf.subarray(0, global_sig_end).toString(), 'base64');
  sig_buf = sig_buf.subarray(sig_info_end + 1); // this might be length+1, but that's allowed

  // Validate that all data has been consumed
  if (sig_buf.length !== 0) {
    throw new Error('invalid minisign signature: trailing bytes');
  }

  return {
    algorithm: algorithm,
    key_id: key_id,
    signature: signature,
    trusted_comment: trusted_comment,
    global_signature: global_sig,
  };
}

// Given a parsed key, parsed signature file, and raw file content, verifies the signature,
// including the global signature (hence validating the trusted comment). Does not throw.
// Returns 'true' if the signature is valid for this file, 'false' otherwise.
function verifySignature(pubkey, signature, file_content) {
  if (!signature.key_id.equals(pubkey.id)) {
    return false;
  }

  let signed_content;
  if (signature.algorithm.equals(Buffer.from('ED'))) {
    signed_content = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX);
    sodium.crypto_generichash(signed_content, file_content);
  } else {
    signed_content = file_content;
  }
  if (!sodium.crypto_sign_verify_detached(signature.signature, signed_content, pubkey.key)) {
    return false;
  }

  const global_signed_content = Buffer.concat([signature.signature, signature.trusted_comment]);
  if (!sodium.crypto_sign_verify_detached(signature.global_signature, global_signed_content, pubkey.key)) {
    return false;
  }

  return true;
}

module.exports = {
  parseKey,
  parseSignature,
  verifySignature,
};
