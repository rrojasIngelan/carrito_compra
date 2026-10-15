<?php

header('Content-Type: application/json; charset=utf-8');

// try {
//         if ($_SERVER['REQUEST_METHOD'] == 'POST')
//         {
// 			$fne = "C:/temp/envio_tbk.json";
// 			$fnr = "C:/temp/respuesta_tbk.json";
			
// 			$json = file_get_contents('php://input');
            
// 			$fe = fopen(@$fne, "w");
// 			fputs($fe, $json);
// 			fclose($fe);
			
// 			$sw = false;
// 			while (!$sw)
// 			{
// 				$sw = file_exists(@$fnr);
// 			}
			
//             $fr = fopen(@$fnr, "r");
// 			while(!feof($fr)) {
// 				$resp = fread($fr, 4096);
// 			}
// 			fclose($fr);
		
// 			unlink(@$fnr);
			
//             echo $resp;
// 		}
// }
// catch (exception $e) {
//     print $e . "\n";
// }

?>