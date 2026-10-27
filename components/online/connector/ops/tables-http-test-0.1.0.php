<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
// Historical installation-specific source: default disabled before bootstrap or input.
if (getenv('NOVASPACE_ENABLE_LEGACY_INSTANCE_SCRIPTS') !== 'I_REVIEWED_THE_SOURCE') { fwrite(STDERR, "STOP: Historical instance-bound script. Read LEGACY_OPS.md before enabling.\n"); exit(78); }


/** Standalone CLI test; no Nextcloud bootstrapping, account or config changes. */
final class NfTablesHttpTest {
    private const PATH = '/ocs/v2.php/apps/novaforge_tables/api/v1/pilot/tables/6/rows/41';
    private $transport;
    public function __construct(callable $transport, private string $reportDir) {
        $this->transport = $transport;
    }
    private function check(bool $ok, string $code): void {
        if (!$ok) throw new RuntimeException($code);
    }
    private function log(string $line): void {
        echo $line, "\n";
        file_put_contents($this->reportDir.'/result.log', $line."\n", FILE_APPEND | LOCK_EX);
    }
    private function request(string $method, string $path, ?array $body = null, bool $auth = true): array {
        // No retries: a timeout after PUT can mean that the write committed.
        $raw = ($this->transport)($method, $path, $body, $auth);
        $this->check(is_array($raw) && isset($raw['http'], $raw['body']), 'TRANSPORT_RESPONSE_INVALID');
        $this->check(strlen($raw['body']) <= 131072, 'RESPONSE_TOO_LARGE');
        try { $json = json_decode($raw['body'], true, 32, JSON_THROW_ON_ERROR); }
        catch (Throwable $e) { throw new RuntimeException('HTTP_'.$raw['http'].'_NON_JSON'); }
        $this->check(is_array($json) && isset($json['ocs']['meta']) && array_key_exists('data',$json['ocs']), 'OCS_ENVELOPE_INVALID');
        return ['http'=>(int)$raw['http'], 'meta'=>$json['ocs']['meta'], 'data'=>$json['ocs']['data']];
    }
    private function ok(array $r): array {
        $this->check($r['http'] === 200, 'HTTP_'.$r['http'].'_STOPP');
        $this->check(($r['meta']['status']??null) === 'ok' && in_array((int)($r['meta']['statuscode']??0),[100,200],true), 'OCS_STATUS_NOT_OK');
        $this->check(is_array($r['data']), 'OCS_DATA_INVALID');
        return $r['data'];
    }
    private function values(array $row): array {
        $this->check(($row['id']??null) === 41 && ($row['tableId']??null) === 6 && is_array($row['data']??null), 'ROW_ID_OR_DATA_INVALID');
        $values = [];
        foreach ($row['data'] as $cell) {
            $id = $cell['columnId']??null;
            $this->check(is_int($id) && in_array($id,[26,27,28],true) && !array_key_exists($id,$values) && is_string($cell['value']??null), 'CELL_ID_OR_VALUE_INVALID');
            $values[$id] = $cell['value'];
        }
        ksort($values);
        return $values;
    }
    private function read(): array {
        $r = $this->ok($this->request('GET', self::PATH.'/version?format=json'));
        $this->check(($r['account']??null) === 'ChatGPT' && ($r['bridgeVersion']??null) === '0.1.1'
            && ($r['protocol']??null) === 1 && ($r['pilotOnly']??null) === true && ($r['tableId']??null) === 6
            && ($r['writeEnabled']??null) === true && ($r['versionKind']??null) === 'server-locked-raw-state'
            && is_string($r['serverVersion']??null) && (bool)preg_match('/^[a-f0-9]{64}$/D',$r['serverVersion']), 'PILOT_IDENTITY_OR_VERSION_INVALID');
        $this->values($r['row']);
        return $r;
    }
    private function unchanged(array $expected): void {
        $actual = $this->read();
        $this->check($actual['serverVersion'] === $expected['serverVersion'] && $actual['row'] === $expected['row'], 'UNEXPECTED_ROW_CHANGE_STOPP');
    }
    private function rejected(array $response, int $http, string $error): void {
        $this->check($response['http'] === $http && ($response['meta']['status']??null) === 'failure' && in_array((int)($response['meta']['statuscode']??0),[$http],true)
            && ($response['data']['error']??null) === $error && ($response['data']['committed']??null) === false, 'EXPECTED_REJECTION_NOT_CONFIRMED');
    }
    private function change(array $before, string $value): array {
        $reply = $this->ok($this->request('PUT', self::PATH.'?format=json', [
            'expectedVersion'=>$before['serverVersion'], 'data'=>[['columnId'=>26,'value'=>$value]],
        ]));
        $this->check(($reply['account']??null) === 'ChatGPT' && ($reply['bridgeVersion']??null) === '0.1.1'
            && ($reply['protocol']??null) === 1 && ($reply['pilotOnly']??null) === true
            && ($reply['status']??null) === 'committed' && ($reply['committed']??null) === true
            && ($reply['readbackVerified']??null) === true, 'COMMIT_OR_READBACK_UNCONFIRMED_STOPP');
        $after = $this->read();
        $wanted = $this->values($before['row']); $wanted[26] = $value; ksort($wanted);
        $this->check($this->values($after['row']) === $wanted && $reply['row'] === $after['row']
            && $reply['serverVersion'] === $after['serverVersion'] && $after['serverVersion'] !== $before['serverVersion'], 'HTTP_READBACK_MISMATCH_STOPP');
        return $after;
    }
    public function run(): void {
        $before = $this->read();
        $this->check($this->values($before['row']) === [26=>'Start',28=>'Unberührt'], 'EXPECTED_SYNTHETIC_START_STATE_MISSING');
        file_put_contents($this->reportDir.'/before.json', json_encode($before,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        $this->log('PASS 1: Authentifizierter GET, Konto ChatGPT, Tabelle 6 / Zeile 41, Ausgangswerte und serverVersion bestaetigt.');

        $scopePath = '/ocs/v2.php/apps/novaforge_tables/api/v1/pilot/tables/6/rows/0/version?format=json';
        $this->rejected($this->request('GET',$scopePath),403,'PILOT_SCOPE_DENIED');
        $this->unchanged($before);
        $this->rejected($this->request('PUT',self::PATH.'?format=json',[
            'expectedVersion'=>'invalid','data'=>[['columnId'=>26,'value'=>'NICHT SCHREIBEN']],
        ]),400,'INVALID_EXPECTED_VERSION');
        $this->unchanged($before);
        $this->rejected($this->request('PUT',self::PATH.'?format=json',[
            'expectedVersion'=>$before['serverVersion'],'data'=>[['columnId'=>29,'value'=>'NICHT SCHREIBEN']],
        ]),400,'INVALID_PATCH');
        $this->unchanged($before);
        $unauth = $this->request('GET',self::PATH.'/version?format=json',null,false);
        $this->check($unauth['http'] === 401 && ($unauth['meta']['status']??null) === 'failure'
            && in_array((int)($unauth['meta']['statuscode']??0),[401,997],true), 'UNAUTHENTICATED_DENIAL_NOT_CONFIRMED');
        $this->unchanged($before);
        $this->log('PASS 2: Scope, ungueltige Version/Spalte und fehlende Anmeldung abgewiesen; Ausgangszeile unveraendert.');

        $marker = 'HTTP-Pilot '.gmdate('Y-m-d H:i:s').' '.bin2hex(random_bytes(4));
        // A report checkpoint exists before this first write. Only A is patched.
        file_put_contents($this->reportDir.'/intended-marker.txt',$marker);
        $after = $this->change($before,$marker);
        file_put_contents($this->reportDir.'/after.json',json_encode($after,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        $this->log('PASS 3: Eine synthetische A-Zelle bedingt geschrieben, Commit und separater HTTP-GET bestaetigt; B/C erhalten.');

        $this->rejected($this->request('PUT',self::PATH.'?format=json',[
            'expectedVersion'=>$before['serverVersion'],'data'=>[['columnId'=>26,'value'=>'VERALTET - NICHT SCHREIBEN']],
        ]),409,'VERSION_CONFLICT');
        $this->unchanged($after);
        $this->log('PASS 4: Alte serverVersion mit HTTP 409 abgewiesen; ganze aktuelle Zeile unveraendert.');

        // Restore only after a fresh read proves exactly our last confirmed state.
        $current = $this->read();
        $this->check($current['row'] === $after['row'] && $current['serverVersion'] === $after['serverVersion'], 'RESTORE_INTERFERENCE_STOPP');
        $restored = $this->change($current,$this->values($before['row'])[26]);
        $this->check($this->values($restored['row']) === $this->values($before['row']), 'RESTORED_VALUES_MISMATCH');
        file_put_contents($this->reportDir.'/restored.json',json_encode($restored,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        $this->log('PASS 5: Urspruengliche Zellwerte vollstaendig zurueckgelesen; Bearbeitungsmetadaten/serverVersion duerfen fortgeschrieben sein.');
        $this->log('ENDE: Begrenzter HTTP-Pilot bestanden. Keine produktive Register- oder allgemeine MCP-Schreibfreigabe.');
    }
}

function nfTablesHttpMain(): int {
    if (PHP_SAPI !== 'cli' || !is_file(getcwd().'/lib/base.php') || !extension_loaded('curl') || !function_exists('proc_open')) {
        fwrite(STDERR,"STOPP: Nextcloud-Hauptordner, PHP CLI, curl und proc_open erforderlich.\n"); return 1;
    }
    $reportDir = '';
    try {
        $tty = fopen('/dev/tty','r+');
        if (!$tty) throw new RuntimeException('INTERACTIVE_TTY_REQUIRED');
        $stty = static function(array $args): string {
            $p = proc_open(array_merge(['stty'],$args),[0=>['file','/dev/tty','r'],1=>['pipe','w'],2=>['file','/dev/null','w']],$pipes);
            if (!is_resource($p)) throw new RuntimeException('TTY_CONTROL_FAILED');
            $text = stream_get_contents($pipes[1]); fclose($pipes[1]);
            if (proc_close($p) !== 0) throw new RuntimeException('TTY_CONTROL_FAILED');
            return trim($text);
        };
        $original = $stty(['-g']);
        register_shutdown_function(static function()use($stty,$original):void { try { $stty([$original]); } catch(Throwable $e){} });
        fwrite($tty,"Kontoname ist fest: ChatGPT. Aktuelles Kontopasswort eingeben (unsichtbar): ");
        $stty(['-echo']);
        try { $line = fgets($tty); }
        finally { $stty([$original]); fwrite($tty,"\n"); fclose($tty); }
        if ($line === false) throw new RuntimeException('PASSWORD_INPUT_ABORTED');
        $password = rtrim($line,"\r\n"); unset($line);
        if ($password === '') throw new RuntimeException('EMPTY_PASSWORD');

        $parent = getcwd().'/data/novaforge-system-backups';
        if (!is_dir($parent) || !is_writable($parent)) throw new RuntimeException('PROTECTED_REPORT_PARENT_UNAVAILABLE');
        $reportDir = $parent.'/tables-http-test-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4));
        $oldMask = umask(0077);
        try { if (!mkdir($reportDir,0700)) throw new RuntimeException('REPORT_DIRECTORY_FAILED'); }
        finally { umask($oldMask); }
        echo "BERICHT (ohne Zugangsdaten): ",$reportDir,"\n";
        $transport = static function(string $method,string $path,?array $body,bool $auth)use(&$password):array {
            $ch = curl_init('https://cloud.example.invalid'.$path);
            if ($ch === false) throw new RuntimeException('CURL_INIT_FAILED');
            $buffer = '';
            $headers = ['OCS-APIRequest: true','Accept: application/json'];
            if ($body !== null) $headers[] = 'Content-Type: application/json';
            curl_setopt_array($ch,[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$headers,
                CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,CURLOPT_CONNECTTIMEOUT=>15,CURLOPT_TIMEOUT=>60,
                CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
                CURLOPT_WRITEFUNCTION=>static function($handle,string $chunk)use(&$buffer):int {
                    if (strlen($buffer)+strlen($chunk)>131072) return 0;
                    $buffer .= $chunk; return strlen($chunk);
                },
            ]);
            if ($auth) curl_setopt_array($ch,[CURLOPT_HTTPAUTH=>CURLAUTH_BASIC,CURLOPT_USERPWD=>'ChatGPT:'.$password]);
            if ($body !== null) curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($body,JSON_THROW_ON_ERROR));
            try {
                $ok = curl_exec($ch); $http = (int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);
                if ($ok === false) throw new RuntimeException('TRANSPORT_FAILURE_NO_RETRY_'.$method);
                return ['http'=>$http,'body'=>$buffer];
            } finally { curl_close($ch); }
        };
        try { (new NfTablesHttpTest($transport,$reportDir))->run(); }
        finally { $password = ''; unset($transport); }
        return 0;
    } catch (Throwable $e) {
        $code = $e instanceof RuntimeException && preg_match('/^[A-Z0-9_]+$/D',$e->getMessage()) ? $e->getMessage() : 'LOCAL_RUNTIME_FAILURE';
        $message = 'STOPP: '.$code.'. Nicht blind wiederholen; Schreibzustand anhand Bericht und frischem Lesen klaeren.';
        fwrite(STDERR,$message."\n");
        if ($reportDir !== '' && is_dir($reportDir)) file_put_contents($reportDir.'/result.log',$message."\n",FILE_APPEND|LOCK_EX);
        return 1;
    }
}
if (realpath($_SERVER['SCRIPT_FILENAME']??'') === __FILE__) exit(nfTablesHttpMain());
