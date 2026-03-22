<?php

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require 'PHPMailer/src/Exception.php';
require 'PHPMailer/src/PHPMailer.php';
require 'PHPMailer/src/SMTP.php';

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    exit;
}

$nombre  = htmlspecialchars(trim($_POST['nombre']));
$email   = filter_var($_POST['email'], FILTER_VALIDATE_EMAIL);
$mensaje = htmlspecialchars(trim($_POST['mensaje']));

if (!$email) {
    exit("Email inválido");
}

$mail = new PHPMailer(true);

try {

    $mail->isSMTP();
    $mail->Host       = 'smtp.hostinger.com';
    $mail->SMTPAuth   = true;
    $mail->Username = getenv('SMTP_USER');
    $mail->Password = getenv('SMTP_PASS');
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = 587;

    // SIEMPRE desde el dominio
    $mail->setFrom('hola@proyeccionconsultores.com.ar', 'Sitio Web');
    
    // A quién le llega
    $mail->addAddress('hola@proyeccionconsultores.com.ar');

    // Para que al responder vaya al usuario
    $mail->addReplyTo($email, $nombre);

    $mail->isHTML(true);
    $mail->Subject = 'Nuevo mensaje desde la web';
    $mail->Body    = "
        <strong>Nombre:</strong> $nombre <br>
        <strong>Email:</strong> $email <br><br>
        <strong>Mensaje:</strong><br>$mensaje
    ";

    $mail->send();
    echo "Mensaje enviado correctamente";

} catch (Exception $e) {
    echo "Error al enviar mensaje";
}
