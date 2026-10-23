<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
return ['ocs' => [
 ['name'=>'tables#list','url'=>'/api/v1/list','verb'=>'GET'],
 ['name'=>'pilot#version','url'=>'/api/v1/pilot/tables/{tableId}/rows/{rowId}/version','verb'=>'GET'],
 ['name'=>'pilot#update','url'=>'/api/v1/pilot/tables/{tableId}/rows/{rowId}','verb'=>'PUT'],
 ['name'=>'register#status','url'=>'/api/v1/register/status','verb'=>'GET'],
 ['name'=>'register#find','url'=>'/api/v1/register/documents/{documentId}/version','verb'=>'GET'],
 ['name'=>'register#version','url'=>'/api/v1/register/rows/{rowId}/version','verb'=>'GET'],
 ['name'=>'register#create','url'=>'/api/v1/register/records','verb'=>'POST'],
 ['name'=>'register#update','url'=>'/api/v1/register/rows/{rowId}','verb'=>'PUT'],
 ['name'=>'general#status','url'=>'/api/v1/general/status','verb'=>'GET'],
 ['name'=>'general#structure','url'=>'/api/v1/general/tables/{tableId}/structure','verb'=>'GET'],
 ['name'=>'general#row','url'=>'/api/v1/general/tables/{tableId}/rows/{rowId}/version','verb'=>'GET'],
 ['name'=>'general#operation','url'=>'/api/v1/general/operations/{requestId}','verb'=>'GET'],
 ['name'=>'general#write','url'=>'/api/v1/general/write','verb'=>'POST'],
]];
