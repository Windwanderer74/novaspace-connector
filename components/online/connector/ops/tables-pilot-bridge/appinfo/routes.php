<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
return ['ocs' => [
 ['name'=>'tables#list','url'=>'/api/v1/list','verb'=>'GET'],
 ['name'=>'pilot#version','url'=>'/api/v1/pilot/tables/{tableId}/rows/{rowId}/version','verb'=>'GET'],
 ['name'=>'pilot#update','url'=>'/api/v1/pilot/tables/{tableId}/rows/{rowId}','verb'=>'PUT'],
]];
