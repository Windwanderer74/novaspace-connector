#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Join authenticated, version-bound PDF chunks. No network or source mutation.

CLI stdin: ASCII JSON-byte-count + newline, followed by exactly that many bytes.
Input: {outputDirectory: absolute path, chunk: files_read_pdf_original_chunk result}.
"""
import base64,hashlib,json,os,re,sys
from pathlib import Path
CHUNK=524288
def require(ok,code):
    if not ok:raise ValueError(code)
def run(config):
    part=config['chunk'];source=part['source'];offset=part['offset'];size=source['size']
    require(source['account']=='ChatGPT' and str(source['fileId']).isdigit() and isinstance(source['path'],str)
            and re.fullmatch(r'"[^"\r\n]+"',source['etag']) and type(size) is int and 0<size<=536870912,'SOURCE_INVALID')
    require(type(offset) is int and 0<=offset<size and offset%CHUNK==0 and part['chunkSize']==CHUNK
            and part['encoding']=='base64' and part['sourceVersionStillCurrent'] is True,'CHUNK_INVALID')
    body=base64.b64decode(part['bytesBase64'],validate=True)
    require(len(body)==part['length']==min(CHUNK,size-offset) and hashlib.sha256(body).hexdigest()==part['sha256'],'CHUNK_HASH_OR_LENGTH_MISMATCH')
    next_offset=offset+len(body);require(part['nextOffset']==(next_offset if next_offset<size else None),'CHUNK_CURSOR_MISMATCH')
    directory=Path(config['outputDirectory']);require(directory.is_absolute(),'OUTPUT_INVALID')
    if offset==0:
        require(not directory.exists() and body.startswith(b'%PDF-'),'OUTPUT_OCCUPIED_OR_NOT_PDF')
        directory.mkdir(parents=True,mode=0o700)
        state={'source':source,'nextOffset':0,'complete':False}
        (directory/'state.json').write_text(json.dumps(state),'utf-8');os.chmod(directory/'state.json',0o600)
    else:
        require(directory.is_dir() and not directory.is_symlink(),'OUTPUT_INVALID')
        state=json.loads((directory/'state.json').read_text('utf-8'))
    require(state['source']==source and state['nextOffset']==offset and state['complete'] is False,'SOURCE_OR_SEQUENCE_CHANGED')
    temporary=directory/'original.partial';require(not temporary.is_symlink() and (temporary.stat().st_size if temporary.exists() else 0)==offset,'PARTIAL_FILE_CHANGED')
    with temporary.open('xb' if offset==0 else 'ab') as stream:os.chmod(temporary,0o600);stream.write(body)
    state['nextOffset']=next_offset
    result={'status':'partial','receivedBytes':next_offset,'totalBytes':size,'nextOffset':part['nextOffset']}
    if next_offset==size:
        digest=hashlib.sha256()
        with temporary.open('rb') as stream:
            for data in iter(lambda:stream.read(CHUNK),b''):digest.update(data)
        original=directory/'original.pdf';require(not original.exists(),'ORIGINAL_TARGET_OCCUPIED');temporary.rename(original)
        state.update(complete=True,sha256=digest.hexdigest(),originalPath=str(original))
        result.update(status='complete',sha256=state['sha256'],originalPath=str(original),source=source,sourceVersionRecheckRequired=True,visualInspectionPerformed=False)
    (directory/'state.json').write_text(json.dumps(state,ensure_ascii=False),'utf-8')
    return result
if __name__=='__main__':
    try:
        length=sys.stdin.buffer.readline(16);require(re.fullmatch(rb'[0-9]{1,7}\n',length) is not None,'FRAME_INVALID')
        count=int(length);require(0<count<=1048576,'FRAME_LIMIT');data=sys.stdin.buffer.read(count);require(len(data)==count,'FRAME_TRUNCATED')
        print(json.dumps(run(json.loads(data)),ensure_ascii=False))
    except Exception as e:
        code=str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z_]+',str(e)) else 'ASSEMBLY_FAILED'
        print(json.dumps({'status':'failed','error':code,'note':'No source mutation; preserve partial state for review.'}));sys.exit(1)
