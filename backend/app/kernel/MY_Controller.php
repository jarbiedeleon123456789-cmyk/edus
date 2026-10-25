<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class MY_Controller extends Controller
{
    public function before_action()
    {
        handle_cors();
    }
}
